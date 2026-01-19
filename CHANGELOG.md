# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-19

Initial stable release of Omni AI.

### ✨ Added

- **Core AI Integration**: Seamlessly connect to Google Gemini and Groq (Llama 3, Mixtral).
- **Selection Actions**: Floating ✨ icon for instant Grammar Fix, Rephrase, Summarize, and Tone changes.
- **Quick Ask**: Powerful contextual chat with AI based on selected text or input contents.
- **Primary Language**: Configure a primary language for streamlined one-click translations.
- **Explain Feature**: Dedicated quick action to break down complex text or jargon.
- **Usage Dashboard**: Real-time tracking of actions taken and tokens/words processed.
- **Theme Support**: Premium Light and Dark modes with glassmorphic UI.
- **Keyboard Shortcuts**: Power-user support for all major features.

### 🛠 Changed

- **Visual Overhaul**: Switched to high-fidelity SVG branding and modern glassmorphic design system.
- **Optimized UI**: Compact overlay menu and high-performance popup layout.
- **Provider Refactor**: Centralized model management for Llama 3.3, Gemini 2.0, and more.

### 🐛 Fixed

- Improved text selection handling for contenteditable fields and inputs.
- Resolved various race conditions in the background service worker.
- Fixed extension context invalidation errors during updates.
