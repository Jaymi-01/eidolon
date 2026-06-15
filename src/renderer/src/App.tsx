import { useState, useEffect, useRef } from 'react'
import {
  Microphone,
  SpeakerHigh,
  Waveform,
  Lightning,
  Power,
  SpeakerLow,
  Pulse,
  CaretDown,
  Check
} from '@phosphor-icons/react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import pitchProcessorUrl from './audio/pitch-processor.ts?url'

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

interface HTMLAudioElementWithSinkId extends HTMLAudioElement {
  setSinkId(deviceId: string): Promise<void>
}

interface DropdownProps {
  label: string
  icon: React.ReactNode
  options: MediaDeviceInfo[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function CustomDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  placeholder
}: DropdownProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((opt) => opt.deviceId === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="space-y-4 flex-1" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <span className="text-zinc-500">{icon}</span>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </label>
      </div>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full bg-zinc-800/30 border border-zinc-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between transition-all duration-300 cursor-pointer hover:bg-zinc-800/50 text-left',
            isOpen && 'ring-1 ring-rose-500/30 border-rose-500/50'
          )}
        >
          <span className="truncate text-zinc-200">
            {selectedOption?.label || placeholder || 'Select Device'}
          </span>
          <CaretDown
            size={14}
            className={cn(
              'text-zinc-500 transition-transform duration-300',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
              {options.length === 0 && (
                <div className="px-4 py-3 text-sm text-zinc-500 italic">No devices found</div>
              )}
              {options.map((option) => (
                <button
                  key={option.deviceId}
                  onClick={() => {
                    onChange(option.deviceId)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full px-4 py-3 text-sm text-left transition-colors flex items-center justify-between group',
                    value === option.deviceId
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                >
                  <span className="truncate">
                    {option.label || `Device ${option.deviceId.slice(0, 5)}`}
                  </span>
                  {value === option.deviceId && <Check size={14} weight="bold" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])

  const [selectedInput, setSelectedInput] = useState<string>(
    localStorage.getItem('selectedInput') || ''
  )
  const [selectedOutput, setSelectedOutput] = useState<string>(
    localStorage.getItem('selectedOutput') || ''
  )
  const [pitch, setPitch] = useState<number>(parseFloat(localStorage.getItem('pitch') || '1.0'))
  const [reverb, setReverb] = useState<number>(parseFloat(localStorage.getItem('reverb') || '0.0'))
  const [robot, setRobot] = useState<number>(parseFloat(localStorage.getItem('robot') || '0.0'))

  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [isStarting, setIsStarting] = useState<boolean>(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pitchNodeRef = useRef<AudioWorkletNode | null>(null)
  const reverbNodeRef = useRef<ConvolverNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const audioTagRef = useRef<HTMLAudioElement | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    async function getDevices(): Promise<void> {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter((d) => d.kind === 'audioinput')
        const audioOutputs = devices.filter((d) => d.kind === 'audiooutput')
        setInputs(audioInputs)
        setOutputs(audioOutputs)
        if (audioInputs.length > 0 && !selectedInput) setSelectedInput(audioInputs[0].deviceId)
        if (audioOutputs.length > 0 && !selectedOutput) setSelectedOutput(audioOutputs[0].deviceId)
      } catch (err) {
        console.error('Error accessing devices:', err)
      }
    }
    getDevices()
    navigator.mediaDevices.ondevicechange = getDevices
  }, [selectedInput, selectedOutput])

  useEffect(() => {
    localStorage.setItem('selectedInput', selectedInput)
    localStorage.setItem('selectedOutput', selectedOutput)
    localStorage.setItem('pitch', pitch.toString())
    localStorage.setItem('reverb', reverb.toString())
    localStorage.setItem('robot', robot.toString())
  }, [selectedInput, selectedOutput, pitch, reverb, robot])

  useEffect(() => {
    if (pitchNodeRef.current) {
      const pitchParam = pitchNodeRef.current.parameters.get('pitch')
      if (pitchParam) {
        pitchParam.setTargetAtTime(pitch, audioContextRef.current?.currentTime || 0, 0.1)
      }
      const robotParam = pitchNodeRef.current.parameters.get('robotAmount')
      if (robotParam) {
        robotParam.setTargetAtTime(robot, audioContextRef.current?.currentTime || 0, 0.1)
      }
    }
  }, [pitch, robot])

  useEffect(() => {
    if (wetGainRef.current && dryGainRef.current) {
      const now = audioContextRef.current?.currentTime || 0
      wetGainRef.current.gain.setTargetAtTime(reverb, now, 0.1)
      dryGainRef.current.gain.setTargetAtTime(1 - reverb, now, 0.1)
    }
  }, [reverb])

  useEffect(() => {
    if (isProcessing && analyserRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const analyser = analyserRef.current
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const draw = (): void => {
        animationFrameRef.current = requestAnimationFrame(draw)
        analyser.getByteFrequencyData(dataArray)

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const barWidth = (canvas.width / bufferLength) * 2.5
          let x = 0

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height
            ctx.fillStyle = '#f43f5e' // Rose-500 accent
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
            x += barWidth + 2
          }
        }
      }
      draw()
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    return (): void => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isProcessing])

  const createImpulseResponse = (context: AudioContext): AudioBuffer => {
    const length = context.sampleRate * 2
    const buffer = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3)
      }
    }
    return buffer
  }

  const startAudio = async (): Promise<void> => {
    try {
      const audioContext = new AudioContext({ sampleRate: 44100 })
      audioContextRef.current = audioContext

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      await audioContext.audioWorklet.addModule(pitchProcessorUrl)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInput === 'default' ? true : { deviceId: { exact: selectedInput } }
      })
      streamRef.current = stream

      sourceNodeRef.current = audioContext.createMediaStreamSource(stream)

      pitchNodeRef.current = new AudioWorkletNode(audioContext, 'pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      })

      analyserRef.current = audioContext.createAnalyser()
      analyserRef.current.fftSize = 64

      reverbNodeRef.current = audioContext.createConvolver()
      reverbNodeRef.current.buffer = createImpulseResponse(audioContext)

      dryGainRef.current = audioContext.createGain()
      wetGainRef.current = audioContext.createGain()

      destinationNodeRef.current = audioContext.createMediaStreamDestination()

      const pitchParam = pitchNodeRef.current.parameters.get('pitch')
      if (pitchParam) pitchParam.setValueAtTime(pitch, audioContext.currentTime)

      const robotParam = pitchNodeRef.current.parameters.get('robotAmount')
      if (robotParam) robotParam.setValueAtTime(robot, audioContext.currentTime)

      wetGainRef.current.gain.setValueAtTime(reverb, audioContext.currentTime)
      dryGainRef.current.gain.setValueAtTime(1 - reverb, audioContext.currentTime)

      sourceNodeRef.current.connect(pitchNodeRef.current)
      pitchNodeRef.current.connect(dryGainRef.current)
      dryGainRef.current.connect(destinationNodeRef.current)
      pitchNodeRef.current.connect(reverbNodeRef.current)
      reverbNodeRef.current.connect(wetGainRef.current)
      wetGainRef.current.connect(destinationNodeRef.current)
      pitchNodeRef.current.connect(analyserRef.current)
      reverbNodeRef.current.connect(analyserRef.current)

      if (audioTagRef.current) {
        audioTagRef.current.srcObject = destinationNodeRef.current.stream
        const audioWithSinkId = audioTagRef.current as HTMLAudioElementWithSinkId
        if (selectedOutput && 'setSinkId' in audioWithSinkId) {
          await audioWithSinkId.setSinkId(selectedOutput)
        }
        await audioTagRef.current.play()
      }

      setIsProcessing(true)
    } catch (err: unknown) {
      console.error('Failed to start audio processing:', err)
      stopAudio()
      throw err
    }
  }

  const stopAudio = (): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error)
      audioContextRef.current = null
    }
    if (audioTagRef.current) {
      audioTagRef.current.pause()
      audioTagRef.current.srcObject = null
    }
    pitchNodeRef.current = null
    reverbNodeRef.current = null
    dryGainRef.current = null
    wetGainRef.current = null
    sourceNodeRef.current = null
    destinationNodeRef.current = null
    setIsProcessing(false)
  }

  const toggleProcessing = async (): Promise<void> => {
    if (isProcessing) {
      stopAudio()
    } else {
      setIsStarting(true)
      try {
        await startAudio()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        alert(`Eidolon Error: ${message}`)
      } finally {
        setIsStarting(false)
      }
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex flex-col items-center justify-center font-sans selection:bg-rose-500/30">
      <audio ref={audioTagRef} className="hidden" />

      <div className="max-w-3xl w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out-expo">
        {/* Main Interface Card */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-md transition-all duration-500 hover:border-zinc-700/50">
          {/* Header */}
          <div className="p-12 pb-6 flex items-end justify-between">
            <div className="animate-in fade-in slide-in-from-left-4 duration-1000 delay-200 ease-out-expo">
              <h1 className="text-4xl font-light tracking-tight text-zinc-100">Eidolon</h1>
              <p className="text-zinc-500 text-sm mt-1">You, but different</p>
            </div>
            <div className="flex items-center gap-3 mb-1 animate-in fade-in duration-1000 delay-500">
              <Pulse
                className={cn(
                  'w-2 h-2 transition-colors duration-500',
                  isProcessing ? 'text-rose-400' : 'text-zinc-700'
                )}
              />
              <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider">
                {isProcessing ? 'Active' : 'Standby'}
              </span>
            </div>
          </div>

          <div className="p-12 pt-0 space-y-12">
            {/* Visualizer */}
            <div className="h-16 bg-zinc-950/50 rounded-2xl overflow-hidden border border-zinc-800/50 animate-in fade-in zoom-in-95 duration-1000 delay-300">
              <canvas
                ref={canvasRef}
                width={800}
                height={64}
                className="w-full h-full opacity-80"
              />
            </div>

            {/* Devices - Custom Dropdowns */}
            <div className="grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-400 ease-out-expo">
              <CustomDropdown
                label="Input Source"
                icon={<Microphone size={16} />}
                options={inputs}
                value={selectedInput}
                onChange={setSelectedInput}
                placeholder="Select Input"
              />
              <CustomDropdown
                label="Output Target"
                icon={<SpeakerHigh size={16} />}
                options={outputs}
                value={selectedOutput}
                onChange={setSelectedOutput}
                placeholder="Select Output"
              />
            </div>

            {/* Effects */}
            <div className="grid grid-cols-1 gap-10 pt-4 border-t border-zinc-800/50 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 ease-out-expo">
              {/* Pitch */}
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-rose-400 group">
                    <Lightning
                      size={16}
                      className="transition-transform duration-500 group-hover:scale-110"
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      Pitch Modulation
                    </span>
                  </div>
                  <span className="text-zinc-400 font-mono text-sm">{pitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.01"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-rose-500 hover:accent-rose-400 transition-all"
                />
              </div>

              {/* Secondary Controls */}
              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-zinc-400 group">
                      <Waveform
                        size={16}
                        className="transition-transform duration-500 group-hover:rotate-12"
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">
                        Robot
                      </span>
                    </div>
                    <span className="text-zinc-500 font-mono text-xs">
                      {(robot * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={robot}
                    onChange={(e) => setRobot(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-500 hover:accent-zinc-400 transition-all"
                  />
                </div>
                <div className="space-y-5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-zinc-400 group">
                      <SpeakerLow
                        size={16}
                        className="transition-transform duration-500 group-hover:-translate-x-0.5"
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">
                        Reverb
                      </span>
                    </div>
                    <span className="text-zinc-500 font-mono text-xs">
                      {(reverb * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={reverb}
                    onChange={(e) => setReverb(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-500 hover:accent-zinc-400 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Start/Stop Button */}
            <div className="pt-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-600 ease-out-expo">
              <button
                onClick={toggleProcessing}
                disabled={isStarting}
                className={cn(
                  'w-full py-5 rounded-2xl font-semibold text-xs uppercase tracking-[0.2em] transition-all duration-500 cursor-pointer overflow-hidden relative',
                  isProcessing
                    ? 'bg-red-600 text-white hover:bg-red-500 shadow-xl shadow-red-900/20 active:scale-[0.98]'
                    : 'bg-rose-600 text-white shadow-xl shadow-rose-900/20 hover:bg-rose-500 hover:scale-[1.01] active:scale-[0.99]',
                  isStarting && 'opacity-50 cursor-wait'
                )}
              >
                <div className="flex items-center justify-center gap-3 relative z-10">
                  {isStarting ? (
                    <Pulse size={18} className="animate-pulse" />
                  ) : (
                    <Power
                      size={18}
                      className={cn(
                        'transition-transform duration-500',
                        isProcessing && 'rotate-180'
                      )}
                    />
                  )}
                  {isStarting
                    ? 'Establishing Link...'
                    : isProcessing
                      ? 'Terminate Engine'
                      : 'Initialize Engine'}
                </div>
                {!isProcessing && !isStarting && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:animate-[shimmer_1.5s_infinite]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
