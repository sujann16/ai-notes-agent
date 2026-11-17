import { StorageManager } from './StorageManager.js';

export const PopupStateManager = {
  progressInterval: null,

  async restoreUI() {
    const state = await StorageManager.get([
      'recording',
      'startTime',
      'captureInterval',
      'notesGenerated',
      'sessionCompleted'
    ]);

    const resultDiv = document.getElementById("result");
    const notesStatusDiv = document.getElementById("notesStatus");
    const startBtn = document.getElementById("startSession");
    const stopBtn = document.getElementById("stopSession");
    const generateBtn = document.getElementById("generateNotes");
    const downloadNotesBtn = document.getElementById("downloadNotes");
    const downloadPdfBtn = document.getElementById("downloadPDF");
    const cleanupBtn = document.getElementById("cleanupSession");
    const intervalSelect = document.getElementById("captureInterval");

    if (state.captureInterval) {
      intervalSelect.value = state.captureInterval.toString();
    }

    if (state.recording) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      generateBtn.disabled = true;
      downloadNotesBtn.disabled = true;
      if (downloadPdfBtn) downloadPdfBtn.disabled = true;
      cleanupBtn.disabled = true;
      this.startProgressTracker(state.startTime, resultDiv);
    } else if (state.sessionCompleted) {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      generateBtn.disabled = false;
      cleanupBtn.disabled = false;
      this.stopProgressTracker();
      resultDiv.innerText = "Recording stopped. Session data has been preserved.";
      
      if (state.notesGenerated) {
        downloadNotesBtn.disabled = false;
        if (downloadPdfBtn) downloadPdfBtn.disabled = false;
        if (notesStatusDiv.innerText === "" || notesStatusDiv.innerText === "Generating notes...") {
          notesStatusDiv.innerText = "Notes generated successfully!";
        }
      } else {
        downloadNotesBtn.disabled = true;
        if (downloadPdfBtn) downloadPdfBtn.disabled = true;
      }
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      generateBtn.disabled = true;
      downloadNotesBtn.disabled = true;
      if (downloadPdfBtn) downloadPdfBtn.disabled = true;
      cleanupBtn.disabled = true;
      this.stopProgressTracker();
      resultDiv.innerText = "Session cleaned successfully.";
      notesStatusDiv.innerText = "";
    }
  },

  startProgressTracker(startTime, element) {
    this.stopProgressTracker();
    const update = () => {
      const elapsedMs = Date.now() - startTime;
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      const minutes = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const seconds = (elapsedSec % 60).toString().padStart(2, '0');
      if (element) {
        element.innerText = `Session Active\n\nElapsed: ${minutes}:${seconds}`;
      }
    };
    update();
    this.progressInterval = setInterval(update, 1000);
  },

  stopProgressTracker() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
};
