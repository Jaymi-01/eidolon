# Eidolon

**Eidolon** is a professional-grade, real-time voice modification engine. Designed for low latency and high-fidelity output, it allows you to transform your voice instantly using advanced digital signal processing.

"You, but different."

---

## 🚀 Key Features

- **Real-time Pitch Modulation**: Shift your voice from deep bass to high soprano with a smooth, high-quality granular shifter.
- **Ultra-Low Latency**: Built on the modern Web Audio API and AudioWorklets for near-instantaneous feedback.
- **Hardware Agnostic**: Supports all connected system microphones and output devices.
- **Minimalist Interface**: A sleek, dark-themed UI focused on performance and ease of use.

---

## 📥 Download (Pre-built)

You can find the latest stable installers in the [release](./release) folder:

- **Windows**: [Download .zip (Installer)](./release/windows/eidolon-windows.zip)
- **macOS**: *Coming soon (Requires building on macOS)*

---

## 🛠️ How to Use

1. **Initialize Engine**: Click the big "Initialize Engine" button to start the audio context.
2. **Select Devices**: Use the dropdowns to choose your Microphone (Input) and Speakers/Headphones (Output).
3. **Adjust Pitch**: Move the "Pitch Modulation" slider.
   - `1.00x` is your natural voice.
   - Below `1.00x` makes your voice deeper.
   - Above `1.00x` makes your voice higher.
4. **Monitor Volume**: Adjust the "Master Gain" to control the output level. Use the visualizer to monitor your signal.

> **Tip**: For the best experience, use headphones to prevent audio feedback (loops) between your speakers and microphone.

---

## 🤝 Contributing & Open Source

Eidolon is open-source and we welcome contributions! Whether it's fixing bugs, improving the DSP logic, or refining the UI, your help is appreciated.

### Development Setup

1. **Clone the repo**:
   ```bash
   git clone https://github.com/Jaymi-01/eidolon.git
   cd eidolon
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Run in development mode**:
   ```bash
   pnpm dev
   ```

4. **Build for production**:
   ```bash
   pnpm build:win  # For Windows
   pnpm build:mac  # For macOS (requires Mac)
   ```

### Contribution Guidelines
1. Fork the project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
