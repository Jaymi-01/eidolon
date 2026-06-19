/**
 * A robust real-time pitch shifter using two cross-fading delay lines.
 */

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: 'pitch',
        defaultValue: 1.0,
        minValue: 0.5,
        maxValue: 2.0
      }
    ]
  }

  private bufferSize: number
  private buffer: Float32Array
  private writeIndex: number
  private delayLine1: number
  private delayLine2: number
  private grainSize: number
  private halfGrain: number

  constructor() {
    super()
    // 1 second buffer at 44.1kHz
    this.bufferSize = 44100
    this.buffer = new Float32Array(this.bufferSize)
    this.writeIndex = 0

    // Size of the crossfade window
    this.grainSize = 1024
    this.halfGrain = 512

    // Initial delays (in samples)
    this.delayLine1 = 0
    this.delayLine2 = this.halfGrain
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0][0]
    const outputL = outputs[0][0]
    const outputR = outputs[0][1]

    if (!input || !outputL) return true

    const pitchParam = parameters.pitch

    for (let i = 0; i < input.length; i++) {
      const inSample = input[i]
      const p = pitchParam.length > 1 ? pitchParam[i] : pitchParam[0]

      // Store input in circular buffer
      this.buffer[this.writeIndex] = inSample

      // Dynamically adjust grain size based on pitch to optimize low-frequency clarity vs latency.
      // A deeper voice (pitch < 1.0) requires a larger window to capture complete wave periods and prevent warbling.
      // A higher voice (pitch >= 1.0) can use a shorter window to minimize latency and echo artifacts.
      const targetGrainSize = p < 1.0 ? 2048 : 1024
      if (this.grainSize !== targetGrainSize) {
        this.grainSize = targetGrainSize
        this.halfGrain = targetGrainSize / 2

        // Reset delay line positions cleanly to prevent indices going out of bounds
        this.delayLine1 = 0
        this.delayLine2 = this.halfGrain
      }

      // Calculate the rate at which delay must change to achieve pitch 'p'
      // pitch = 1 - d(delay)/dt  =>  d(delay)/dt = 1 - pitch
      const delayRate = 1.0 - p

      // Update delay pointers
      this.delayLine1 += delayRate
      this.delayLine2 += delayRate

      // Wrap delay pointers and handle cross-fading
      // We want the delay to stay within [0, grainSize]
      if (this.delayLine1 >= this.grainSize) this.delayLine1 -= this.grainSize
      if (this.delayLine1 < 0) this.delayLine1 += this.grainSize

      if (this.delayLine2 >= this.grainSize) this.delayLine2 -= this.grainSize
      if (this.delayLine2 < 0) this.delayLine2 += this.grainSize

      // Calculate crossfade weight based on delayLine1's position.
      // Instead of a triangular window (which causes sharp non-differentiable points and metallic buzz),
      // we use a smooth sinusoidal/Hann window (equal-amplitude crossfade) which eliminates click/buzz artifacts.
      const x1 = this.delayLine1 / this.grainSize
      const weight1 = Math.sin(Math.PI * x1) * Math.sin(Math.PI * x1)
      const weight2 = 1.0 - weight1

      // Read from buffer at delayed positions
      const readIdx1 =
        (this.writeIndex - this.delayLine1 - this.halfGrain + this.bufferSize) % this.bufferSize
      const readIdx2 =
        (this.writeIndex - this.delayLine2 - this.halfGrain + this.bufferSize) % this.bufferSize

      // Interpolate for smoother sound
      const i1 = Math.floor(readIdx1)
      const f1 = readIdx1 - i1
      const sample1 = this.buffer[i1] * (1 - f1) + this.buffer[(i1 + 1) % this.bufferSize] * f1

      const i2 = Math.floor(readIdx2)
      const f2 = readIdx2 - i2
      const sample2 = this.buffer[i2] * (1 - f2) + this.buffer[(i2 + 1) % this.bufferSize] * f2

      const outSample = sample1 * weight1 + sample2 * weight2

      outputL[i] = outSample
      if (outputR) outputR[i] = outSample

      // Advance write pointer
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize
    }

    return true
  }
}

registerProcessor('pitch-processor', PitchProcessor)
