# Contributing to TuxShow

First off, thank you for considering contributing to TuxShow! It's people like you that make TuxShow a great tool for educational theater and students everywhere.

Whether you are a professional developer, a theater teacher with feedback, or a student who found a bug, we welcome your help. This document provides guidelines for how you can contribute to the project.

## 🎭 How Can I Contribute?

### 1. Reporting Bugs
If you find a bug, please create an issue on GitHub. Include:
* Your operating system (e.g., Ubuntu 24.04, Raspberry Pi OS).
* The version of TuxShow you are using.
* A clear, step-by-step description of how to reproduce the bug.
* Terminal output if the app crashes (run `./tuxshow` from the terminal to see logs).

### 2. Suggesting Features
Theater is highly collaborative! If you have an idea for a feature that would help junior high or high school productions (like OSC support or Arduino triggers), open an issue and tag it as an `enhancement`.

### 3. Contributing Code
Tech-savvy students and developers can contribute directly to the codebase to add features or fix bugs. 

#### Local Development Setup
TuxShow is built using Electron, React, and Vite, optimized for Ubuntu Linux.
1. **Fork the repository** on GitHub.
2. **Clone your fork** locally: `git clone https://github.com/your-username/TuxShow.git`
3. **Install dependencies**: run `npm install`
4. **Start the development server**: run `npm run dev`

#### Pull Request Process
1. Create a new branch for your feature or bugfix: `git checkout -b feature/my-new-feature`
2. Make your changes and commit them with clear, descriptive messages.
3. Push your branch to your fork: `git push origin feature/my-new-feature`
4. Open a Pull Request against the `main` branch of the official TuxShow repository.

#### Release & Version Bump Procedure
When preparing a new release, follow these steps in order to guarantee the version is updated across the codebase and the GitHub Release notes are correctly populated:

1. **Version Code Updates**: Update the version number in:
   - `package.json`
   - `package-lock.json` (Run `npm install --package-lock-only --legacy-peer-deps` to synchronize)
   - `src/App.jsx` (Update the header subtitle and About modal version strings)
   - `compile_manual.js` (Update the default version fallback)
2. **Manual Renaming & Compilation**:
   - Rename `docs/TuxShow_v<OLD_VERSION>_Manual.md` to `docs/TuxShow_v<NEW_VERSION>_Manual.md` and update internal references.
   - Delete the old `.pdf` manual, and run `npx electron compile_manual.js --no-sandbox` to generate the new `docs/TuxShow v<NEW_VERSION>.pdf`.
3. **Changelog and README**:
   - Add a new release section with details and dates in `CHANGELOG.md`.
   - Update the version string under capabilities in `README.md`.
4. **Git Commit & Tag**:
   - Stage and commit all changes: `git commit -m "release: Bump version to <NEW_VERSION>"`.
   - Create and push the version tag: `git tag v<NEW_VERSION> && git push origin v<NEW_VERSION>`.
5. **Publish / Update Release Notes**:
   - Pushing the tag triggers the automated GitHub Actions release builder.
   - Once the action bot creates the release, synchronize the release notes on GitHub with the changelog details using the GitHub CLI:
     `gh release edit v<NEW_VERSION> --notes-file path/to/notes.txt`
     *(Or directly input notes: `gh release edit v<NEW_VERSION> --notes "notes content"`)*

## 🤝 Code of Conduct
By participating in this project, you agree to abide by our Code of Conduct. We are committed to providing a welcoming and inspiring environment for students, educators, and developers alike.

## 📄 License Context
Remember that TuxShow is licensed under the GNU GPLv3. Any contributions you make will be subject to this same open-source license to ensure the software remains forever free for schools.
