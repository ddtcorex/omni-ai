# Privacy Policy for Omni AI

**Last Updated:** January 21, 2026

Omni AI ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension collects, uses, and discloses your information.

## 1. Data Collection and Usage

**Omni AI does NOT collect, store, or share your personal data on our servers.**

We operate with a "Local-First" and "Privacy-First" philosophy:

- **API Keys:** Your API keys (for Google Gemini, Groq, or OpenAI) are stored locally on your device using Chrome's secure storage (`chrome.storage.local`). They are never sent to us or any third-party other than the respective AI provider for authentication.
- **User Content:** The text you select to process (e.g., for summarizing, translating, or rephrasing) is sent directly from your browser to the chosen AI Provider's API. We do not act as a middleman and do not store logs of your content.
- **Usage Statistics:** Metrics such as total words processed or actions taken are calculated and stored locally on your device for your personal dashboard. We do not have access to this data.

## 2. Third-Party Services

To provide AI functionality, Omni AI connects directly to third-party API providers based on your selection. Please review their privacy policies to understand how they handle your data:

- **Google Gemini (Google AI):** [Google Privacy Policy](https://policies.google.com/privacy)
- **Groq:** [Groq Privacy Policy](https://wow.groq.com/privacy-policy/)
- **OpenAI:** [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)
- **Google OAuth:** Used solely for authentication to sync your settings across devices if you choose to sign in.

## 3. Permissions Explained

- **activeTab:** Used to read the text you explicitly select on the current page to process it.
- **storage:** Used to save your settings, API keys, and local usage history.
- **identity:** Used to authenticate with Google for optional settings synchronization.
- **contextMenus:** Used to add the "Omni AI" option to your right-click menu.
- **host_permissions:** Used to allow the extension to send requests to `https://generativelanguage.googleapis.com/*` (Google Gemini API).

## 4. Changes to This Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

## 5. Contact Us

If you have any questions about this Privacy Policy, please contact us via our GitHub repository:
https://github.com/ddtcorex/omni-ai/issues
