import { useState, useEffect, useRef } from 'react'
import {
  Microphone,
  SpeakerHigh,
  Power,
  Pulse,
  CaretDown,
  Check,
  SpeakerSimpleHigh,
  Plus,
  Trash,
  FloppyDisk,
  GenderMale,
  GenderFemale
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
  voiceMode?: 'male' | 'female'
  malePitch: number
  femalePitch: number
  pitch?: number
  volume: number
}

function getVoiceDescriptor(mode: 'male' | 'female', pitch: number): string {
  if (mode === 'male') {
    if (pitch <= 0.60) return 'Deep Bass'
    if (pitch <= 0.70) return 'Bass-Baritone'
    if (pitch <= 0.80) return 'Baritone'
    if (pitch <= 0.90) return 'Tenor'
    return 'Countertenor'
  } else {
    if (pitch <= 1.15) return 'Low Alto'
    if (pitch <= 1.25) return 'Contralto'
    if (pitch <= 1.38) return 'Mezzo-Soprano'
    if (pitch <= 1.55) return 'Soprano'
    return 'Coloratura Soprano'
  }
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
  const [voiceMode, setVoiceMode] = useState<'male' | 'female'>(
    (localStorage.getItem('voiceMode') as 'male' | 'female') || 'male'
  )
  const [malePitch, setMalePitch] = useState<number>(
    parseFloat(localStorage.getItem('malePitch') || '0.80')
  )
  const [femalePitch, setFemalePitch] = useState<number>(
    parseFloat(localStorage.getItem('femalePitch') || '1.30')
  )
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

  const voiceModeRef = useRef(voiceMode)
  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])

  const currentPitch = voiceMode === 'male' ? malePitch : femalePitch

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
    localStorage.setItem('voiceMode', voiceMode)
    localStorage.setItem('malePitch', malePitch.toString())
    localStorage.setItem('femalePitch', femalePitch.toString())
    localStorage.setItem('volume', volume.toString())
    localStorage.setItem('presets', JSON.stringify(presets))
  }, [selectedInput, selectedOutput, voiceMode, malePitch, femalePitch, volume, presets])

  useEffect(() => {
    if (pitchNodeRef.current) {
      const pitchParam = pitchNodeRef.current.parameters.get('pitch')
      if (pitchParam) {
        pitchParam.setTargetAtTime(currentPitch, audioContextRef.current?.currentTime || 0, 0.1)
      }
    }
  }, [currentPitch])

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
            ctx.fillStyle = voiceModeRef.current === 'male' ? '#6366f1' : '#f43f5e'
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
      if (pitchParam) pitchParam.setValueAtTime(currentPitch, audioContext.currentTime)

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
      voiceMode,
      malePitch,
      femalePitch,
      volume
    }
    setPresets([...presets, newPreset])
    setPresetName('')
  }

  const applyPreset = (p: Preset): void => {
    if (p.voiceMode) {
      setVoiceMode(p.voiceMode)
      setMalePitch(p.malePitch)
      setFemalePitch(p.femalePitch)
    } else if (p.pitch !== undefined) {
      // Backward compatibility for old presets
      if (p.pitch < 1.0) {
        setVoiceMode('male')
        setMalePitch(p.pitch)
      } else {
        setVoiceMode('female')
        setFemalePitch(p.pitch)
      }
    }
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
                  isProcessing
                    ? voiceMode === 'male'
                      ? 'text-indigo-400'
                      : 'text-rose-400'
                    : 'text-zinc-700'
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
                  className={cn(
                    'w-full rounded-xl transition-all duration-75',
                    voiceMode === 'male' ? 'bg-indigo-500' : 'bg-rose-500'
                  )}
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
                    className={cn(
                      'bg-zinc-800/30 border border-zinc-800 rounded-lg px-2.5 py-1 text-[11px] text-zinc-200 focus:ring-1 outline-none transition-all placeholder:text-zinc-600 w-32',
                      voiceMode === 'male' ? 'focus:ring-indigo-500/30' : 'focus:ring-rose-500/30'
                    )}
                  />
                  <button
                    onClick={savePreset}
                    disabled={!presetName.trim()}
                    className={cn(
                      'p-1.5 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer',
                      voiceMode === 'male'
                        ? 'bg-indigo-600 hover:bg-indigo-500'
                        : 'bg-rose-600 hover:bg-rose-500'
                    )}
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
                      className={cn(
                        'px-2.5 py-1 text-[10px] text-zinc-300 transition-colors cursor-pointer',
                        p.voiceMode === 'male' ||
                          (!p.voiceMode && p.pitch !== undefined && p.pitch < 1.0)
                          ? 'hover:text-indigo-400'
                          : 'hover:text-rose-400'
                      )}
                    >
                      {p.name}
                    </button>
                    <button
                      onClick={() => deletePreset(p.id)}
                      className="px-1.5 py-1 bg-zinc-800/60 text-zinc-600 hover:text-red-400 transition-colors border-l border-zinc-800 cursor-pointer"
                    >
                      <Trash size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Master Volume */}
            <div className="pt-3 border-t border-zinc-800/50 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 ease-out-expo">
              <div className="space-y-3 bg-zinc-900/20 border border-zinc-800/40 rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-zinc-400 group">
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
                  className={cn(
                    'w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer transition-all',
                    voiceMode === 'male'
                      ? 'accent-indigo-500 hover:accent-indigo-400'
                      : 'accent-rose-500 hover:accent-rose-400'
                  )}
                />
              </div>
            </div>

            {/* Voice Modulations */}
            <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-550 ease-out-expo">
              {/* Male Voice Modulation Card */}
              <div
                onClick={() => setVoiceMode('male')}
                className={cn(
                  'group flex flex-col justify-between p-5 rounded-2xl border transition-all duration-500 cursor-pointer relative overflow-hidden select-none',
                  voiceMode === 'male'
                    ? 'bg-indigo-950/10 border-indigo-500/30 shadow-lg shadow-indigo-950/10'
                    : 'bg-zinc-900/10 border-zinc-800/50 opacity-60 hover:opacity-80 hover:border-zinc-700/50'
                )}
              >
                {/* Active indicator glow */}
                {voiceMode === 'male' && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'p-2 rounded-xl transition-colors duration-500',
                          voiceMode === 'male'
                            ? 'bg-indigo-500/15 text-indigo-400'
                            : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-400'
                        )}
                      >
                        <GenderMale size={18} weight="bold" />
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            'text-xs font-semibold uppercase tracking-wider transition-colors duration-500',
                            voiceMode === 'male' ? 'text-indigo-400' : 'text-zinc-400'
                          )}
                        >
                          Male Voice
                        </span>
                        <span className="text-[10px] text-zinc-500">Pitch & Tone</span>
                      </div>
                    </div>
                    {voiceMode === 'male' && (
                      <span className="text-indigo-400 text-[10px] font-mono bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span
                        className={cn(
                          'text-[11px] font-medium transition-colors',
                          voiceMode === 'male' ? 'text-indigo-400' : 'text-zinc-400'
                        )}
                      >
                        {getVoiceDescriptor('male', malePitch)}
                      </span>
                      <span className="text-zinc-500 font-mono text-xs">
                        {malePitch.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.50"
                      max="0.95"
                      step="0.01"
                      value={malePitch}
                      onChange={(e) => {
                        e.stopPropagation()
                        setMalePitch(parseFloat(e.target.value))
                        setVoiceMode('male')
                      }}
                      className={cn(
                        'w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer transition-all',
                        voiceMode === 'male'
                          ? 'accent-indigo-500 hover:accent-indigo-400'
                          : 'accent-zinc-600 hover:accent-zinc-500'
                      )}
                    />
                    <div className="flex justify-between text-[9px] text-zinc-600 font-medium">
                      <span>Deep Bass</span>
                      <span>Countertenor</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Female Voice Modulation Card */}
              <div
                onClick={() => setVoiceMode('female')}
                className={cn(
                  'group flex flex-col justify-between p-5 rounded-2xl border transition-all duration-500 cursor-pointer relative overflow-hidden select-none',
                  voiceMode === 'female'
                    ? 'bg-rose-950/10 border-rose-500/30 shadow-lg shadow-rose-950/10'
                    : 'bg-zinc-900/10 border-zinc-800/50 opacity-60 hover:opacity-80 hover:border-zinc-700/50'
                )}
              >
                {/* Active indicator glow */}
                {voiceMode === 'female' && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'p-2 rounded-xl transition-colors duration-500',
                          voiceMode === 'female'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-zinc-800 text-zinc-500 group-hover:text-zinc-400'
                        )}
                      >
                        <GenderFemale size={18} weight="bold" />
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            'text-xs font-semibold uppercase tracking-wider transition-colors duration-500',
                            voiceMode === 'female' ? 'text-rose-400' : 'text-zinc-400'
                          )}
                        >
                          Female Voice
                        </span>
                        <span className="text-[10px] text-zinc-500">Pitch & Tone</span>
                      </div>
                    </div>
                    {voiceMode === 'female' && (
                      <span className="text-rose-400 text-[10px] font-mono bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span
                        className={cn(
                          'text-[11px] font-medium transition-colors',
                          voiceMode === 'female' ? 'text-rose-400' : 'text-zinc-400'
                        )}
                      >
                        {getVoiceDescriptor('female', femalePitch)}
                      </span>
                      <span className="text-zinc-500 font-mono text-xs">
                        {femalePitch.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.05"
                      max="1.80"
                      step="0.01"
                      value={femalePitch}
                      onChange={(e) => {
                        e.stopPropagation()
                        setFemalePitch(parseFloat(e.target.value))
                        setVoiceMode('female')
                      }}
                      className={cn(
                        'w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer transition-all',
                        voiceMode === 'female'
                          ? 'accent-rose-500 hover:accent-rose-400'
                          : 'accent-zinc-600 hover:accent-zinc-500'
                      )}
                    />
                    <div className="flex justify-between text-[9px] text-zinc-600 font-medium">
                      <span>Low Alto</span>
                      <span>High Soprano</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Start/Stop Button */}
            <div className="pt-2 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-600 ease-out-expo">
              <button
                onClick={toggleProcessing}
                disabled={isStarting}
                className={cn(
                  'w-full py-4 rounded-2xl font-semibold text-xs uppercase tracking-[0.2em] cursor-pointer overflow-hidden relative text-white',
                  isStarting
                    ? 'btn-engine-starting opacity-50'
                    : isProcessing
                      ? 'btn-engine-active shadow-xl shadow-red-950/20'
                      : voiceMode === 'male'
                        ? 'btn-engine-male shadow-xl shadow-indigo-950/20'
                        : 'btn-engine-female shadow-xl shadow-rose-950/20'
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
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
