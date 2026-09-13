# Privacy Policy for Omni AI

**Last Updated:** September 14, 2026

Omni AI ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension collects, uses, and discloses your information.

## 1. Data Collection and Usage

**Omni AI does NOT collect, store, or share your personal data on our servers.**

We operate with a "Local-First" and "Privacy-First" philosophy:

- **API Keys:** Your API keys (for Google Gemini, OpenAI, Groq, Anthropic Claude, or a Custom Gateway) are stored locally on your device using Chrome's storage (`chrome.storage.local`). They are never sent to us, and are sent to the respective AI provider only to authenticate your own requests.
- **User Content:** The text you select to process (for example to summarize, translate, or rephrase) is sent directly from your browser to the chosen AI provider's API using your own API key. We do not act as a middleman and we do not store logs of your content.
- **Page Content:** When you use the side panel's Page Tools (Summarize, Smart Translate, Explain), the text of the page you are viewing is read and sent to your chosen provider for that request only. It is not stored and not sent anywhere else.
- **Usage Statistics:** Metrics such as total words processed or actions taken are calculated and stored locally on your device for your personal dashboard. We do not have access to this data and it is never transmitted.
- **No tracking:** We do not collect browsing history, we do not log your prompts, and we do not collect any identity information. There are no analytics, advertising, or telemetry SDKs in the extension.

## 2. Third-Party Services

To provide AI functionality, Omni AI connects directly to third-party API providers based on your selection. Please review their privacy policies to understand how they handle your data:

- **Google Gemini (Google AI):** [Google Privacy Policy](https://policies.google.com/privacy)
- **OpenAI:** [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)
- **Groq:** [Groq Privacy Policy](https://wow.groq.com/privacy-policy/)
- **Anthropic Claude:** [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Custom Gateway:** If you configure a Custom Gateway, your text is sent to the OpenAI-compatible endpoint whose base URL you entered. That endpoint, and its data handling, is chosen and operated by you or by a third party you select, not by us. Review that provider's own privacy policy.

Your settings, including your preferred provider and languages, are stored with `chrome.storage.sync`, which means they can follow your Chrome profile across devices if you are signed in to Chrome. That synchronization is performed by Chrome using your Google account; we never receive a copy.

## 3. Permissions Explained

- **activeTab:** Used to read the text you explicitly select on the current page so it can be processed.
- **sidePanel:** Used to display the extension's side panel, which hosts the Page Tools and the streaming chat.
- **storage:** Used to save your settings, API keys, and local usage history.
- **contextMenus:** Used to add the "Omni AI" options to your right-click menu.
- **host_permissions (`https://*/*`, `http://*/*`):** Omni AI works on any page you choose to use it on. The content script needs to read the text you select or focus, and to replace it with the AI result, on whatever site you are reading or writing. The extension does not read pages you have not interacted with, and it sends page text only when you invoke an action.

## 4. Data Retention and Sharing

We do not retain your content, because we never receive it. We do not sell, rent, or share your data with anyone. Data leaves your browser only as the direct request to the AI provider you configured, which you initiate yourself.

## 5. Changes to This Policy

We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the date above.

## 6. Contact Us

If you have any questions about this Privacy Policy, please contact us via our GitHub repository:
https://github.com/ddtcorex/omni-ai/issues
