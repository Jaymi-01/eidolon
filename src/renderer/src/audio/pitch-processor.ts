/**
 * A simple Granular Pitch Shifter AudioWorkletProcessor.
 */

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: 'pitch',
        defaultValue: 1.0,
        minValue: 0.5,
        maxValue: 2.0
      },
      {
        name: 'robotAmount',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0
      },
      {
        name: 'gateThreshold',
        defaultValue: -100.0,
        minValue: -100.0,
        maxValue: 0.0
      }
    ]
  }

  private bufferSize: number
  private buffer: Float32Array
  private writeIndex: number
  private readIndex1: number
  private readIndex2: number
  private grainSize: number
  private halfGrain: number
  private phi: number

  constructor() {
    super()
    this.bufferSize = 44100
    this.buffer = new Float32Array(this.bufferSize)
    this.writeIndex = 0
    this.readIndex1 = 0
    this.readIndex2 = 1024
    this.grainSize = 2048
    this.halfGrain = 1024
    this.phi = 0
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0][0]
    const output = outputs[0][0]
    const pitchParam = parameters.pitch
    const robotParam = parameters.robotAmount
    const gateParam = parameters.gateThreshold

    if (!input) return true

    const gateThreshold = gateParam.length > 1 ? gateParam[0] : gateParam[0]
    const thresholdLinear = Math.pow(10, gateThreshold / 20)

    for (let i = 0; i < input.length; i++) {
      // 0. Noise Gate
      let inSample = input[i]
      if (Math.abs(inSample) < thresholdLinear && gateThreshold > -100) {
        inSample = 0
      }

      // 1. Pitch Shifting (Granular)
      this.buffer[this.writeIndex] = inSample

      const p = pitchParam.length > 1 ? pitchParam[i] : pitchParam[0]

      const idx1 = Math.floor(this.readIndex1) % this.bufferSize
      const idx2 = Math.floor(this.readIndex2) % this.bufferSize

      const phase =
        ((this.readIndex1 - (this.writeIndex - this.grainSize + this.bufferSize)) %
          this.bufferSize) /
        this.grainSize
      const weight = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)

      let sample = this.buffer[idx1] * weight + this.buffer[idx2] * (1 - weight)

      // 2. Robot Effect (Ring Modulation)
      const robotAmount = robotParam.length > 1 ? robotParam[i] : robotParam[0]
      if (robotAmount > 0) {
        const osc = Math.sin(this.phi)
        this.phi += 0.1 // ~700Hz modulation at 44.1kHz
        if (this.phi > Math.PI * 2) this.phi -= Math.PI * 2

        // Blend robot effect
        sample = sample * (1 - robotAmount) + sample * osc * robotAmount
      }

      output[i] = sample

      // Advance pointers
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize
      this.readIndex1 = (this.readIndex1 + p) % this.bufferSize
      this.readIndex2 = (this.readIndex2 + p) % this.bufferSize

      const delay = (this.writeIndex - this.readIndex1 + this.bufferSize) % this.bufferSize
      if (delay > this.grainSize * 2 || delay < this.grainSize / 2) {
        this.readIndex1 = (this.writeIndex - this.grainSize + this.bufferSize) % this.bufferSize
        this.readIndex2 = (this.readIndex1 + this.halfGrain) % this.bufferSize
      }
    }

    return true
  }
}

registerProcessor('pitch-processor', PitchProcessor)
