import { useState, useEffect, useRef } from 'react'
import {
  Microphone,
  SpeakerHigh,
  Lightning,
  Power,
  Pulse,
  CaretDown,
  Check,
  SpeakerSimpleHigh,
  Plus,
  Trash,
  FloppyDisk
} from '@phosphor-icons/react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import pitchProcessorUrl from './audio/pitch-processor.ts?worker&url'

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

interface DropdownProps {
  label: string
  icon: React.ReactNode
  options: MediaDeviceInfo[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

interface Preset {
  id: string
  name: string
  pitch: number
  volume: number
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
  const [volume, setVolume] = useState<number>(parseFloat(localStorage.getItem('volume') || '1.0'))

  const [presets, setPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem('presets')
    return saved ? JSON.parse(saved) : []
  })
  const [presetName, setPresetName] = useState('')

  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [isStarting, setIsStarting] = useState<boolean>(false)
  const [peakLevel, setPeakLevel] = useState<number>(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pitchNodeRef = useRef<AudioWorkletNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const levelFrameRef = useRef<number | null>(null)

  useEffect(() => {
    async function getDevices(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        stream.getTracks().forEach((track) => track.stop())

        const audioInputs = devices.filter((d) => d.kind === 'audioinput')
        const audioOutputs = devices.filter((d) => d.kind === 'audiooutput')
        setInputs(audioInputs)
        setOutputs(audioOutputs)

        if (audioInputs.length > 0) {
          setSelectedInput((prev) => prev || audioInputs[0].deviceId)
        }
        if (audioOutputs.length > 0) {
          setSelectedOutput((prev) => prev || audioOutputs[0].deviceId)
        }
      } catch {
        // Handle error silently
      }
    }
    getDevices()
    navigator.mediaDevices.ondevicechange = getDevices
  }, [])

  useEffect(() => {
    if (audioContextRef.current && isProcessing && selectedOutput) {
      // @ts-ignore: setSinkId is available in modern Chromium/Electron
      audioContextRef.current.setSinkId(selectedOutput).catch(() => {})
    }
  }, [selectedOutput, isProcessing])

  useEffect(() => {
    localStorage.setItem('selectedInput', selectedInput)
    localStorage.setItem('selectedOutput', selectedOutput)
    localStorage.setItem('pitch', pitch.toString())
    localStorage.setItem('volume', volume.toString())
    localStorage.setItem('presets', JSON.stringify(presets))
  }, [selectedInput, selectedOutput, pitch, volume, presets])

  useEffect(() => {
    if (pitchNodeRef.current) {
      const pitchParam = pitchNodeRef.current.parameters.get('pitch')
      if (pitchParam) {
        pitchParam.setTargetAtTime(pitch, audioContextRef.current?.currentTime || 0, 0.1)
      }
    }
  }, [pitch])

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        volume,
        audioContextRef.current?.currentTime || 0,
        0.1
      )
    }
  }, [volume])

  useEffect(() => {
    if (isProcessing && analyserRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const analyser = analyserRef.current
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateLevel = (): void => {
        levelFrameRef.current = requestAnimationFrame(updateLevel)
        analyser.getByteFrequencyData(dataArray)

        let max = 0
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > max) max = dataArray[i]
        }

        const normalized = max / 255
        setPeakLevel(normalized)

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const barWidth = (canvas.width / bufferLength) * 2.5
          let x = 0

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height
            ctx.fillStyle = '#f43f5e'
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
            x += barWidth + 2
          }
        }
      }
      updateLevel()
    } else {
      if (levelFrameRef.current) cancelAnimationFrame(levelFrameRef.current)
      setPeakLevel(0)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    return (): void => {
      if (levelFrameRef.current) cancelAnimationFrame(levelFrameRef.current)
    }
  }, [isProcessing])

  const startAudio = async (): Promise<void> => {
    try {
      const audioContext = new AudioContext({
        latencyHint: 'interactive'
      })
      audioContextRef.current = audioContext

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      await audioContext.audioWorklet.addModule(pitchProcessorUrl)

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedInput ? { exact: selectedInput } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // @ts-ignore: custom constraint
          latency: 0
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      sourceNodeRef.current = audioContext.createMediaStreamSource(stream)

      pitchNodeRef.current = new AudioWorkletNode(audioContext, 'pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      })

      analyserRef.current = audioContext.createAnalyser()
      analyserRef.current.fftSize = 64

      masterGainRef.current = audioContext.createGain()

      const pitchParam = pitchNodeRef.current.parameters.get('pitch')
      if (pitchParam) pitchParam.setValueAtTime(pitch, audioContext.currentTime)

      masterGainRef.current.gain.setValueAtTime(volume, audioContext.currentTime)

      sourceNodeRef.current.connect(pitchNodeRef.current)
      pitchNodeRef.current.connect(masterGainRef.current)
      masterGainRef.current.connect(audioContext.destination)
      masterGainRef.current.connect(analyserRef.current)

      // Add a small delay to allow parameters to propagate
      await new Promise((resolve) => setTimeout(resolve, 50))

      if (selectedOutput) {
        // @ts-ignore: setSinkId is available in modern Chromium/Electron
        await audioContext.setSinkId(selectedOutput).catch(() => {})
      }

      setIsProcessing(true)
    } catch (err: unknown) {
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
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    pitchNodeRef.current = null
    masterGainRef.current = null
    sourceNodeRef.current = null
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

  const savePreset = (): void => {
    if (!presetName.trim()) return
    const newPreset: Preset = {
      id: crypto.randomUUID(),
      name: presetName,
      pitch,
      volume
    }
    setPresets([...presets, newPreset])
    setPresetName('')
  }

  const applyPreset = (p: Preset): void => {
    setPitch(p.pitch)
    setVolume(p.volume)
  }

  const deletePreset = (id: string): void => {
    setPresets(presets.filter((p) => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 flex flex-col items-center justify-center font-sans selection:bg-rose-500/30">
      <div className="max-w-3xl w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out-expo">
        {/* Main Interface Card */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl shadow-2xl shadow-black/50 backdrop-blur-md transition-all duration-500 hover:border-zinc-700/50">
          {/* Header */}
          <div className="p-8 pb-3 flex items-end justify-between">
            <div className="animate-in fade-in slide-in-from-left-4 duration-1000 delay-200 ease-out-expo">
              <h1 className="text-3xl font-light tracking-tight text-zinc-100">Eidolon</h1>
              <p className="text-zinc-500 text-xs mt-0.5">You, but different</p>
            </div>
            <div className="flex items-center gap-3 mb-1 animate-in fade-in duration-1000 delay-500">
              <Pulse
                className={cn(
                  'w-2 h-2 transition-colors duration-500',
                  isProcessing ? 'text-rose-400' : 'text-zinc-700'
                )}
              />
              <span className="text-zinc-500 text-[10px] font-medium uppercase tracking-wider">
                {isProcessing ? 'Active' : 'Standby'}
              </span>
            </div>
          </div>

          <div className="p-8 pt-0 space-y-6">
            {/* Visualizer & Level Meter */}
            <div className="flex gap-3 h-14 animate-in fade-in zoom-in-95 duration-1000 delay-300">
              <div className="flex-1 bg-zinc-950/50 rounded-2xl overflow-hidden border border-zinc-800/50">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={56}
                  className="w-full h-full opacity-80"
                />
              </div>
              <div className="w-10 bg-zinc-950/50 rounded-2xl border border-zinc-800/50 p-1 flex items-end">
                <div
                  className="w-full bg-rose-500 rounded-xl transition-all duration-75"
                  style={{ height: `${peakLevel * 100}%` }}
                />
              </div>
            </div>

            {/* Devices - Custom Dropdowns */}
            <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-400 ease-out-expo">
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

            {/* Presets System */}
            <div className="space-y-4 pt-3 border-t border-zinc-800/50 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-450">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-500">
                  <FloppyDisk size={14} />
                  <label className="text-[10px] font-semibold uppercase tracking-wider">
                    Presets
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="New preset..."
                    className="bg-zinc-800/30 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11px] text-zinc-200 focus:ring-1 focus:ring-rose-500/30 outline-none transition-all placeholder:text-zinc-600 w-32"
                  />
                  <button
                    onClick={savePreset}
                    disabled={!presetName.trim()}
                    className="p-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus size={12} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {presets.length === 0 && (
                  <span className="text-zinc-600 text-[10px] italic">No saved presets</span>
                )}
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center bg-zinc-800/40 border border-zinc-800 rounded-lg overflow-hidden transition-all hover:border-zinc-700"
                  >
                    <button
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 text-[10px] text-zinc-300 hover:text-rose-400 transition-colors"
                    >
                      {p.name}
                    </button>
                    <button
                      onClick={() => deletePreset(p.id)}
                      className="px-1.5 py-1 bg-zinc-800/60 text-zinc-600 hover:text-red-400 transition-colors border-l border-zinc-800"
                    >
                      <Trash size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Effects */}
            <div className="grid grid-cols-2 gap-6 pt-3 border-t border-zinc-800/50 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 ease-out-expo">
              {/* Master Volume */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-rose-400 group">
                    <SpeakerSimpleHigh
                      size={14}
                      className="transition-transform duration-500 group-hover:scale-110"
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Master Gain
                    </span>
                  </div>
                  <span className="text-zinc-400 font-mono text-xs">
                    {(volume * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-rose-500 hover:accent-rose-400 transition-all"
                />
              </div>

              {/* Pitch */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-rose-400 group">
                    <Lightning
                      size={14}
                      className="transition-transform duration-500 group-hover:scale-110"
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Pitch Modulation
                    </span>
                  </div>
                  <span className="text-zinc-400 font-mono text-xs">{pitch.toFixed(2)}x</span>
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
            </div>

            {/* Start/Stop Button */}
            <div className="pt-2 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-600 ease-out-expo">
              <button
                onClick={toggleProcessing}
                disabled={isStarting}
                className={cn(
                  'w-full py-4 rounded-2xl font-semibold text-xs uppercase tracking-[0.2em] transition-all duration-500 cursor-pointer overflow-hidden relative',
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
