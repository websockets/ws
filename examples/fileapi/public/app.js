/* global Uploader */
function onFilesSelected(e) {
  const files = e.target.files;
  let totalFiles = files.length;

  if (!totalFiles) return;

  const button = e.srcElement;
  button.disabled = true;

  const progress = document.querySelector('div#progress');
  progress.innerHTML = '0%';

  let filesSent = 0;

  const uploader = new Uploader('ws://localhost:8080', function() {
    Array.prototype.slice.call(files, 0).forEach(function(file) {
      if (file.name === '.') {
        --totalFiles;
        return;
      }
      uploader.sendFile(file, function(error) {
        if (error) {
          console.log(error);
          return;
        }
        ++filesSent;
        progress.innerHTML = ~~((filesSent / totalFiles) * 100) + '%';
        console.log('Sent: ' + file.name);
      });
    });
  });

  uploader.ondone = function() {
    uploader.close();
    progress.innerHTML = '100% done, ' + totalFiles + ' files sent.';
  };
}

window.onload = function() {
  const importButtons = document.querySelectorAll('[type="file"]');
  Array.prototype.slice.call(importButtons, 0).forEach(function(importButton) {
    importButton.addEventListener('change', onFilesSelected, false);
  });
};
