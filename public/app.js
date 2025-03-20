// Global variables
let dotCount = 0;
let isPopupOpen = false;
let videoGallery = [];
let currentVideoIndex = -1;
let currentCategory = '';
let currentRequestId = null;
let currentPage = 1;
let totalPages = 1;
let itemsPerPage = 10;

// Utility Functions
function formatTime(seconds) {
  if (seconds <= 0) return "Any second now...";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes} min`;
  if (remainder < 30) return `${minutes} min`;
  return `${minutes}.5 min`;
}

function debounce(func, wait, immediate) {
  let timeout;
  return function() {
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      timeout = null;
      if (!immediate) func.apply(this, arguments);
    }, wait);
    if (callNow) func.apply(this, arguments);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function() {
    if (!inThrottle) {
      func.apply(this, arguments);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// UI Functions
function startCountdown(card) {
  const etaSpan = card.querySelector(".eta");
  if (!etaSpan) return;

  let secondsLeft = 300;
  etaSpan.textContent = formatTime(secondsLeft);

  const interval = setInterval(() => {
    secondsLeft--;
    etaSpan.textContent = formatTime(secondsLeft);
    if (secondsLeft <= 0) {
      clearInterval(interval);
      card.querySelector(".progress-info").textContent = "Processing... Awaiting completion";
    }
  }, 1000);

  card.addEventListener('DOMSubtreeModified', () => {
    if (!card.querySelector('.progress-info')) clearInterval(interval);
  }, { once: true });
}

function initiateDelete(requestId, button) {
  const card = document.querySelector(`.history-card[data-request-id="${requestId}"]`);
  if (!card) return;

  if (button.textContent === "Delete") {
    button.textContent = "Confirm Delete?";
    button.style.backgroundColor = "#ff9800";
    setTimeout(() => {
      if (button.textContent === "Confirm Delete?") {
        button.textContent = "Delete";
        button.style.backgroundColor = "#f44336";
      }
    }, 3000);
  } else if (button.textContent === "Confirm Delete?") {
    card.classList.add("poof-out");
    const url = currentCategory === '' ? `/api/delete?request_id=${requestId}` : '/api/remove_category';
    const options = currentCategory === '' ? { method: "DELETE" } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, category: currentCategory })
    };

    fetch(url, options)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (data.error) {
          console.error("Delete error:", data.error);
          card.classList.remove("poof-out");
          alert("Failed to delete: " + data.error);
        } else {
          console.log(data.message);
          removeTaskFromState(requestId);
          if (currentCategory === '' || JSON.parse(card.dataset.categories).length <= 1) {
            card.remove();
          } else {
            const categories = JSON.parse(card.dataset.categories).filter(c => c !== currentCategory);
            card.dataset.categories = JSON.stringify(categories);
            const tags = categories.map(cat => cat !== '' ? `<span class="category-tag">${cat}</span>` : '').join('');
            const videoElement = card.querySelector('video');
            const videoSrc = videoElement ? videoElement.src : '';
            const highResSrc = videoElement ? videoElement.dataset.highRes : '';
            card.innerHTML = `
              <div class="tag-container">${tags}</div>
              <video loop muted data-high-res="${highResSrc}" src="${videoSrc}"></video>
              <div class="card-content">
                <button onclick="copySettings('${requestId}', this)">Copy Settings</button>
                <button class="delete-btn" onclick="initiateDelete('${requestId}', this)" style="background-color: #f44336;">Delete</button>
              </div>
            `;
            const video = card.querySelector("video");
            if (video) {
              video.load();
              attachVideoEvents(video);
            }
            attachDragEvents(card);
          }
          updateVideoGallery();
          filterHistoryByCategory();
        }
      })
      .catch(error => {
        console.error("Fetch error in initiateDelete:", error);
        card.classList.remove("poof-out");
        alert("Failed to delete video: " + error.message);
      });
  }
}

function makeTextareasExpandable() {
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });
    textarea.dispatchEvent(new Event('input'));
  });
}

function makeTagsClickable() {
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('category-tag')) {
      const category = e.target.textContent.trim();
      switchCategory(category);
    }
  });
}

function updateBlinkingDots() {
  const dots = ".".repeat(dotCount % 4);
  document.getElementById("blinkingDots").innerText = `Processing${dots}`;
  dotCount++;
}

function updateEstimatedTime(requestId, initialTime) {
  const card = document.querySelector(`.history-card[data-request-id="${requestId}"]`);
  if (!card) return;
  
  const progressInfo = card.querySelector(".progress-info");
  const startTimestamp = parseInt(card.dataset.timestamp);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const elapsedSeconds = currentTimestamp - startTimestamp;
  let timeLeft = Math.max(0, initialTime - elapsedSeconds);
  
  if (progressInfo) {
    if (timeLeft <= 0) {
      progressInfo.innerText = `Generating... Almost finished!`;
    } else {
      progressInfo.innerText = `Generating... Estimated Time: ${formatTime(timeLeft)}`;
    }
  }
  
  const estimatedTimeDisplay = document.getElementById("estimatedTime");
  if (timeLeft <= 0) {
    estimatedTimeDisplay.innerText = "Estimated Time Left: Almost finished!";
  } else if (timeLeft <= 30) {
    estimatedTimeDisplay.innerText = "Estimated Time Left: Almost finished!";
  } else {
    estimatedTimeDisplay.innerText = `Estimated Time Left: ${formatTime(timeLeft)}`;
  }
}

function updateEstimatedCost() {
  const duration = parseInt(document.getElementById("duration").value) || 5;
  const costPerSecond = 10;
  const maxBillableSeconds = 6;
  const billableDuration = Math.min(duration, maxBillableSeconds);
  const estimatedCost = billableDuration * costPerSecond;
  document.getElementById("estimatedCost").innerText = `Estimated Cost: ${estimatedCost}¢`;
}

// Form and Drag-and-Drop Handling
const dropZone = document.getElementById('dropZone');
const imageInput = document.getElementById('imageInput');
const durationInput = document.getElementById('duration');
const thumbnailPopup = document.getElementById('thumbnailPopup');
const videoPopup = document.getElementById('videoPopup');
const galleryPopup = document.getElementById('galleryPopup');
const overlay = document.getElementById('overlay');
const categoryPrompt = document.getElementById('categoryPrompt');

function displayThumbnail(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    dropZone.innerHTML = `
      <div class="thumbnail-container">
        <img src="${event.target.result}" alt="Thumbnail">
        <button class="thumbnail-delete-btn">×</button>
      </div>
    `;
    
    const thumbnailContainer = dropZone.querySelector('.thumbnail-container');
    const deleteBtn = thumbnailContainer.querySelector('.thumbnail-delete-btn');
    const thumbnail = thumbnailContainer.querySelector('img');
    
    deleteBtn.addEventListener('click', () => {
      dropZone.innerHTML = 'Drop image file here or click to select';
      imageInput.value = '';
    });
    
    thumbnail.addEventListener('mouseenter', () => {
      thumbnailPopup.innerHTML = `<img src="${event.target.result}" alt="Popup Thumbnail">`;
      thumbnailPopup.style.display = 'block';
    });
    
    thumbnail.addEventListener('mouseleave', () => {
      thumbnailPopup.style.display = 'none';
    });
    
    thumbnail.addEventListener('mousemove', (e) => {
      const offsetX = 10;
      const offsetY = 10;
      thumbnailPopup.style.left = (e.pageX + offsetX) + 'px';
      thumbnailPopup.style.top = (e.pageY + offsetY) + 'px';
      thumbnailPopup.style.transform = 'none';
    });
  };
  reader.readAsDataURL(file);
}

imageInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) displayThumbnail(e.target.files[0]);
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('hover'));
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('hover'));
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    imageInput.files = files;
    displayThumbnail(files[0]);
  }
});

dropZone.addEventListener('click', (e) => {
  if (e.target.tagName !== 'IMG') {
    showGalleryPopup();
  }
});

function showGalleryPopup() {
  fetch('/api/history')
    .then(response => response.json())
    .then(data => {
      let allData = Array.isArray(data) ? data : (data.videos || []);
      const imagePaths = [...new Set(allData.map(item => item.image_url).filter(url => url && url.startsWith(`https://${process.env.VERCEL_BLOB_DOMAIN}/input/`)))];
      if (imagePaths.length === 0) {
        galleryPopup.innerHTML = '<p>No images available</p>';
      } else {
        galleryPopup.innerHTML = '<div class="popup-header">Select Thumbnail</div><div id="masonry-container"></div>';
        const container = document.getElementById('masonry-container');
        imagePaths.forEach(url => {
          const img = document.createElement('img');
          img.loading = "lazy";
          img.src = url;
          img.alt = 'Gallery Image';
          img.addEventListener('click', () => {
            fetch(url)
              .then(response => response.blob())
              .then(blob => {
                const fileName = url.split('/').pop();
                const file = new File([blob], fileName, { type: blob.type });
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                imageInput.files = dataTransfer.files;
                displayThumbnail(file);
                closeGalleryPopup();
              });
          });
          img.classList.add('masonry-item');
          container.appendChild(img);
        });
      }
      overlay.style.display = 'block';
      galleryPopup.style.display = "flex";
      galleryPopup.style.position = 'absolute';
      const rect = dropZone.getBoundingClientRect();
      galleryPopup.style.top = `${rect.bottom + window.scrollY + 5}px`;
      galleryPopup.style.left = `${rect.left + window.scrollX}px`;
      galleryPopup.style.transform = 'none';
      document.addEventListener('click', closeGalleryPopupOnOutsideClick);
      document.addEventListener('keydown', handleEscKeydown);
    })
    .catch(error => {
      console.error('Error fetching gallery images:', error);
      galleryPopup.innerHTML = '<p>Error loading images</p>';
      overlay.style.display = 'block';
      galleryPopup.style.display = 'block';
    });
}

function closeGalleryPopup() {
  overlay.style.display = 'none';
  galleryPopup.style.display = 'none';
  galleryPopup.innerHTML = '';
  document.removeEventListener('click', closeGalleryPopupOnOutsideClick);
  document.removeEventListener('keydown', handleEscKeydown);
}

function closeGalleryPopupOnOutsideClick(e) {
  if (!galleryPopup.contains(e.target) && e.target !== dropZone) {
    closeGalleryPopup();
  }
}

function handleEscKeydown(e) {
  if (e.key === 'Escape') {
    closeGalleryPopup();
    closeVideoPopup();
    closeCategoryPrompt();
  }
}

// Submission Handling
document.getElementById("genform").addEventListener("submit", async function(e) {
  e.preventDefault();
  const generateBtn = document.getElementById("generateBtn");
  generateBtn.style.backgroundColor = "#FFD700";
  document.getElementById("status").innerText = "Submitting request...";

  const formData = new FormData(this);
  const estimatedTime = 300;

  const imageInput = document.getElementById("imageInput");
  let thumbnailData = '';
  if (imageInput.files && imageInput.files[0]) {
    thumbnailData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(imageInput.files[0]);
    });
  }

  fetch("/api/generate", { method: "POST", body: formData })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      console.log("✅ API Response:", data);
      if (data.error) {
        document.getElementById("status").innerText = "Error: " + data.error;
        generateBtn.style.backgroundColor = "";
      } else {
        const requestId = data.request_id;
        console.log("✅ Request ID from API:", requestId);
        document.getElementById("status").innerText = "Status: Processing";
        addPlaceholderCard(requestId, thumbnailData, estimatedTime);
        startPollingStatus(requestId);
        generateBtn.style.backgroundColor = "";
      }
    })
    .catch(error => {
      console.error("Submission error:", error);
      document.getElementById("status").innerText = "Fetch error: " + error.message;
      generateBtn.style.backgroundColor = "";
    });
});

durationInput.addEventListener('input', updateEstimatedCost);

function saveTaskState(requestId) {
  try {
    const tasks = JSON.parse(localStorage.getItem('activeTasks') || '[]');
    tasks.push({ requestId: requestId, timestamp: Math.floor(Date.now() / 1000) });
    localStorage.setItem('activeTasks', JSON.stringify(tasks));
    if (imageInput.files && imageInput.files[0]) {
      const reader = new FileReader();
      reader.onload = function(event) {
        localStorage.setItem('lastUsedImage', event.target.result);
        localStorage.setItem('lastUsedImageName', imageInput.files[0].name);
      };
      reader.readAsDataURL(imageInput.files[0]);
    }
  } catch (error) {
    console.error("Failed to save task state:", error);
  }
}

function loadTaskState() {
  console.log("Task state loading disabled");
}

function removeTaskFromState(requestId) {
  try {
    const tasks = JSON.parse(localStorage.getItem('activeTasks') || '[]');
    const updatedTasks = tasks.filter(task => task.requestId !== requestId);
    localStorage.setItem('activeTasks', JSON.stringify(updatedTasks));
  } catch (error) {
    console.error("Failed to remove task state:", error);
  }
}

function addPlaceholderCard(requestId, thumbnailData, estimatedTime) {
  console.log("📌 Adding Placeholder Card - Request ID:", requestId);
  const historyDiv = document.getElementById("history");
  const card = document.createElement("div");
  card.className = "history-card fade-in";
  card.dataset.requestId = requestId;
  card.dataset.timestamp = Math.floor(Date.now() / 1000);
  card.innerHTML = `
    <img class="thumbnail dimmed" src="${thumbnailData || 'placeholder.png'}" alt="Thumbnail" 
      onerror="this.src='https://via.placeholder.com/150?text=Image+Failed'; this.alt='Failed to load';">
    <div class="progress-info">Processing... Estimated time: <span class="eta">${formatTime(estimatedTime)}</span></div>
  `;
  historyDiv.insertBefore(card, historyDiv.firstChild);
  attachDragEvents(card);
  startCountdown(card);
}

function startPollingStatus(requestId) {
  if (window.activePolls && window.activePolls[requestId]) {
    console.log(`Already polling ${requestId}, skipping duplicate`);
    return;
  }
  if (!window.activePolls) window.activePolls = {};
  window.activePolls[requestId] = true;

  const pollInterval = 5000;
  const maxAttempts = 120;
  let attempts = 0;
  let currentRequestId = requestId;

  const intervalId = setInterval(async () => {
    attempts++;
    try {
      const response = await fetch(`/api/status?request_id=${currentRequestId}`);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      console.log("Polling status for", currentRequestId, ":", data);

      if (data.request_id && data.request_id !== currentRequestId) {
        console.log(`Switching from ${currentRequestId} to ${data.request_id}`);
        const card = document.querySelector(`.history-card[data-request-id="${currentRequestId}"]`);
        if (card) card.dataset.requestId = data.request_id;
        delete window.activePolls[currentRequestId];
        currentRequestId = data.request_id;
        window.activePolls[currentRequestId] = true;
      }

      document.getElementById("status").textContent = `Status: ${data.status}`;

      if (data.status === "FAILED") {
        updateCardWithVideo(currentRequestId, null, "Failed");
        clearInterval(intervalId);
        delete window.activePolls[currentRequestId];
        removeTaskFromState(requestId);
      } else if (data.status === "COMPLETED") {
        if (data.video_url) {
          updateCardWithVideo(currentRequestId, data.video_url);
          clearInterval(intervalId);
          delete window.activePolls[currentRequestId];
          removeTaskFromState(requestId);
        } else {
          updateCardWithVideo(currentRequestId, null, "Completed, awaiting video");
        }
      } else if (attempts >= maxAttempts) {
        updateCardWithVideo(currentRequestId, null, "Timed out");
        clearInterval(intervalId);
        delete window.activePolls[currentRequestId];
        removeTaskFromState(requestId);
      }
    } catch (err) {
      console.error("Error polling status:", err);
      document.getElementById("status").textContent = `Fetch error: ${err.message}`;
      if (attempts >= maxAttempts) {
        updateCardWithVideo(currentRequestId, null, "Polling error");
        clearInterval(intervalId);
        delete window.activePolls[currentRequestId];
        removeTaskFromState(requestId);
      }
    }
  }, pollInterval);
}

function updateCardWithVideo(requestId, videoUrl, statusText) {
  const card = document.querySelector(`.history-card[data-request-id="${requestId}"]`);
  if (!card) return;
  const tags = JSON.stringify([currentCategory || '']);
  card.dataset.categories = tags;
  card.innerHTML = `
    <div class="tag-container">${currentCategory ? `<span class="category-tag">${currentCategory}</span>` : ''}</div>
    ${videoUrl ? `<video loop muted src="${videoUrl}" preload="metadata"></video>` : `<p>${statusText || "Processing complete, awaiting video"}</p>`}
    <div class="card-content">
      <button onclick="copySettings('${requestId}', this)">Copy Settings</button>
      <button class="delete-btn" onclick="initiateDelete('${requestId}', this)" style="background-color: #f44336;">Delete</button>
    </div>
  `;
  const video = card.querySelector("video");
  if (video) {
    video.load();
    attachVideoEvents(video);
  }
  attachDragEvents(card);
  updateVideoGallery();
}

function fetchHistory() {
  return new Promise((resolve, reject) => {
    fetch("/api/history?nocache=" + Date.now())
      .then(response => response.json())
      .then(async data => {
        console.log("API response:", data);
        const historyDiv = document.getElementById("history");
        let videos = Array.isArray(data) ? data : (data.videos || []);
        const now = Math.floor(Date.now() / 1000);
        const originalLength = videos.length;
        videos = videos.filter(item => {
          if ((item.status === "IN_QUEUE" || item.status === "IN_PROGRESS") && (now - item.timestamp > 3600)) {
            console.warn(`Removing stale ${item.status} request: ${item.request_id}`);
            return false;
          }
          return true;
        });

        if (videos.length < originalLength) {
          updateHistoryJson(videos);
        }

        if (videos.length === 0) {
          historyDiv.innerHTML = '<p>No videos found</p>';
          resolve();
          return;
        }

        videos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        videos.forEach(item => {
          console.log("Rendering item:", item.request_id, "status:", item.status);
          let card = document.querySelector(`.history-card[data-request-id="${item.request_id}"]`);
          if (!card) {
            card = document.createElement("div");
            card.className = "history-card fade-in";
            card.dataset.requestId = item.request_id;
            card.dataset.seed = item.seed || '';
            card.dataset.categories = JSON.stringify(item.categories || ['']);
            card.dataset.timestamp = item.timestamp || now;
            historyDiv.insertBefore(card, historyDiv.firstChild);
          }

          const tags = (item.categories || [])
            .filter(cat => cat !== '')
            .map(cat => `<span class="category-tag">${cat}</span>`)
            .join('');

          if (item.status === "IN_QUEUE" || item.status === "IN_PROGRESS") {
            card.innerHTML = `
              <img class="thumbnail dimmed" src="${item.image_url}" alt="Thumbnail" 
                onerror="this.src='https://via.placeholder.com/150?text=Image+Failed'; this.alt='Failed to load';">
              <div class="progress-info">Processing... Estimated time: <span class="eta"></span></div>
            `;
            if (!window.activePolls || !window.activePolls[item.request_id]) {
              startPollingStatus(item.request_id);
            }
            if (!card.dataset.countdownStarted) {
              startCountdown(card);
              card.dataset.countdownStarted = true;
            }
          } else {
            const videoSrc = item.video_url || item.low_res_video_url || '';
            const content = videoSrc 
              ? `<video loop muted src="${videoSrc}" preload="metadata"></video>`
              : `<p>Status: ${item.status}${item.status === "COMPLETED" ? ", awaiting video" : ""}</p>`;

            card.innerHTML = `
              <div class="tag-container">${tags}</div>
              ${content}
              <div class="card-content">
                <button onclick="copySettings('${item.request_id}', this)">Copy Settings</button>
                <button class="delete-btn" onclick="initiateDelete('${item.request_id}', this)" style="background-color: #f44336;">Delete</button>
              </div>
            `;
            const video = card.querySelector("video");
            if (video) {
              video.load();
              attachVideoEvents(video);
            }
          }
          attachDragEvents(card);
        });
        resolve();
      })
      .catch(error => {
        console.error("History fetch error:", error);
        document.getElementById("history").innerHTML = `<p>No history yet or error: ${error.message}</p>`;
        resolve();
      });
  });
}

function startCountdown(card) {
  const etaSpan = card.querySelector(".eta");
  if (!etaSpan) return;

  const startTimestamp = parseInt(card.dataset.timestamp);
  const now = Math.floor(Date.now() / 1000);
  let secondsLeft = Math.max(300 - (now - startTimestamp), 0); // 5 mins adjusted for elapsed time

  etaSpan.textContent = formatTime(secondsLeft);

  const interval = setInterval(() => {
    secondsLeft--;
    etaSpan.textContent = formatTime(secondsLeft);
    if (secondsLeft <= 0 || !card.querySelector('.progress-info')) {
      clearInterval(interval);
      if (card.querySelector('.progress-info')) {
        card.querySelector(".progress-info").textContent = "Processing... Awaiting completion";
      }
    }
  }, 1000);

  card.addEventListener('DOMSubtreeModified', () => {
    if (!card.querySelector('.progress-info')) clearInterval(interval);
  }, { once: true });
}
  
// Add this helper function to app.js
function updateHistoryJson(updatedVideos) {
  fetch('/api/update-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videos: updatedVideos }),
  })
    .then(response => response.json())
    .then(data => console.log("History.json updated:", data))
    .catch(error => console.error("Error updating history.json:", error));
}

function attachVideoEvents(video) {
  const highResUrl = video.dataset.highRes || video.src;
  video.addEventListener("mouseenter", (e) => {
    if (!isPopupOpen) {
      video.play().catch(err => console.log("Video play error:", err));
    }
  });
  video.addEventListener("mouseleave", (e) => {
    if (!isPopupOpen) {
      video.pause();
      video.currentTime = 0;
    }
  });
  video.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const card = video.closest('.history-card');
    currentRequestId = card.dataset.requestId;
    showVideoPopup(highResUrl);
  });
}

function attachDragEvents(card) {
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.dataset.requestId);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', (e) => {
    card.classList.remove('dragging');
  });
}

function updateVideoGallery() {
  const historyVideos = document.querySelectorAll('#history .history-card video');
  videoGallery = Array.from(historyVideos)
    .map(video => video.dataset.highRes || video.src)
    .filter(src => src && src.length > 0);
  console.log("Video gallery updated:", videoGallery);
}

function showVideoPopup(videoUrl) {
  if (!videoUrl) {
    console.error("No video URL provided to showVideoPopup");
    return;
  }
  
  window.scrollTo(0, 0);
  document.body.classList.add('popup-active');
  videoPopup.style.display = "block";
  videoPopup.style.position = "fixed";
  videoPopup.style.top = "50%";
  videoPopup.style.left = "50%";
  videoPopup.style.transform = "translate(-50%, -50%)";
  videoPopup.style.zIndex = "2000";
  videoPopup.style.maxWidth = "90vw";
  videoPopup.style.maxHeight = "90vh";
  
  overlay.style.display = "block";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.zIndex = "1999";
  
  videoPopup.innerHTML = `
    <div class="video-container">
      <video controls loop src="${videoUrl}" autoplay class="fade"></video>
    </div>
    <div class="popup-btn popup-btn-left" onclick="copySettingsFromPopup('${currentRequestId}')">Copy Settings</div>
    <div class="popup-btn popup-btn-right" id="deletePopupBtn">Delete</div>
  `;
  
  const popupVideo = videoPopup.querySelector("video");
  if (popupVideo) {
    popupVideo.load();
    popupVideo.play().catch(err => console.log("Popup video play error:", err));
  }
  
  document.addEventListener("keydown", handleEscKeydown);
  document.addEventListener("click", closeVideoPopupOnOutsideClick);
  document.addEventListener("keydown", handleArrowKeydown);
  
  const deleteButton = document.getElementById("deletePopupBtn");
  if (deleteButton) {
    deleteButton.addEventListener("click", function() {
      if (this.textContent === "Delete") {
        this.textContent = "Confirm Delete?";
        this.style.backgroundColor = "#ff9800";
        setTimeout(() => {
          if (this.textContent === "Confirm Delete?") {
            this.textContent = "Delete";
            this.style.backgroundColor = "#1e1e1e";
            this.style.color = "#f44336";
          }
        }, 3000);
      } else if (this.textContent === "Confirm Delete?") {
        const card = document.querySelector(`.history-card[data-request-id="${currentRequestId}"]`);
        if (card) card.classList.add("poof-out");
        fetch(currentCategory === '' ? `/api/delete?request_id=${currentRequestId}` : '/api/remove_category', {
          method: currentCategory === '' ? "DELETE" : "POST",
          headers: currentCategory !== '' ? { 'Content-Type': 'application/json' } : {},
          body: currentCategory !== '' ? JSON.stringify({ request_id: currentRequestId, category: currentCategory }) : null
        })
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              console.error("Delete error:", data.error);
              if (card) card.classList.remove("poof-out");
            } else {
              removeTaskFromState(currentRequestId);
              if (card) {
                card.remove();
                updateVideoGallery();
                filterHistoryByCategory();
              }
              closeVideoPopup();
            }
          })
          .catch(error => {
            console.error("Fetch error:", error);
            if (card) card.classList.remove("poof-out");
          });
      }
    });
  }
}

function closeVideoPopup() {
  console.log("Closing popup");
  isPopupOpen = false;
  overlay.style.display = "none";
  videoPopup.style.display = "none";
  document.body.classList.remove('popup-active');
  document.removeEventListener("click", closeVideoPopupOnOutsideClick);
  document.removeEventListener("keydown", handleEscKeydown);
  document.removeEventListener("keydown", handleArrowKeydown);
  currentVideoIndex = -1;
  currentRequestId = null;
}

function closeVideoPopupOnOutsideClick(e) {
  if (!videoPopup.contains(e.target) && !e.target.classList.contains('popup-btn')) {
    closeVideoPopup();
  }
}

function handleArrowKeydown(e) {
  if (!isPopupOpen || videoGallery.length === 0) return;
  if (e.key === "ArrowRight") {
    currentVideoIndex = (currentVideoIndex + 1) % videoGallery.length;
    updatePopupVideo();
  } else if (e.key === "ArrowLeft") {
    currentVideoIndex = (currentVideoIndex - 1 + videoGallery.length) % videoGallery.length;
    updatePopupVideo();
  }
}

function updatePopupVideo() {
  const popupVideo = videoPopup.querySelector("video");
  if (popupVideo && videoGallery[currentVideoIndex]) {
    popupVideo.classList.remove("fade");
    void popupVideo.offsetWidth;
    popupVideo.src = videoGallery[currentVideoIndex];
    popupVideo.classList.add("fade");
    popupVideo.load();
    popupVideo.play().catch(err => console.log("Popup video play error:", err));
    
    const videoElements = document.querySelectorAll('#history .history-card video');
    for (const videoEl of videoElements) {
      if ((videoEl.dataset.highRes === videoGallery[currentVideoIndex]) || 
          (videoEl.src === videoGallery[currentVideoIndex])) {
        currentRequestId = videoEl.closest('.history-card').dataset.requestId;
        break;
      }
    }
  }
}

function copySettingsFromPopup(requestId) {
  copySettings(requestId, document.createElement('button'));
  closeVideoPopup();
}

// Category Management
function addCategoryTab(categoryName) {
  const tabs = document.getElementById('categoryTabs');
  const allTab = tabs.querySelector('.category-tab[data-category=""]');
  const addTab = document.getElementById('addCategoryTab');
  const existingTabs = Array.from(tabs.querySelectorAll('.category-tab:not(.add-tab):not([data-category=""])'));
  if (existingTabs.some(tab => tab.dataset.category === categoryName)) return;
  const newTab = document.createElement('div');
  newTab.className = 'category-tab';
  newTab.textContent = categoryName;
  newTab.dataset.category = categoryName;
  newTab.addEventListener('click', () => switchCategory(categoryName));
  newTab.addEventListener('dragover', (e) => e.preventDefault());
  newTab.addEventListener('drop', (e) => handleDrop(e, categoryName));
  existingTabs.push(newTab);
  existingTabs.sort((a, b) => a.textContent.localeCompare(b.textContent));
  tabs.innerHTML = '';
  tabs.appendChild(allTab);
  existingTabs.forEach(tab => tabs.appendChild(tab));
  tabs.appendChild(addTab);
  saveCategories();
}

function switchCategory(category) {
  const tabs = document.querySelectorAll(".category-tab");
  tabs.forEach(tab => {
    tab.classList.remove("active");
    if (tab.dataset.category === category) {
      tab.classList.add("active");
    }
  });
  currentCategory = category;
  filterHistoryByCategory();
}

function filterHistoryByCategory() {
  const historyCards = document.querySelectorAll(".history-card");
  historyCards.forEach(card => {
    const categories = JSON.parse(card.dataset.categories || '[""]');
    if (currentCategory === '') {
      card.style.display = categories.includes('') ? "inline-block" : "none";
    } else {
      card.style.display = categories.includes(currentCategory) ? "inline-block" : "none";
    }
  });
}

function handleDrop(e, targetCategory) {
  e.preventDefault();
  const requestId = e.dataTransfer.getData('text/plain');
  const card = document.querySelector(`.history-card[data-request-id="${requestId}"]`);
  if (!card) return;
  
  card.style.opacity = "0.5";
  
  fetch('/api/move_video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      request_id: requestId, 
      category: targetCategory,
      remove_from_all: true
    })
  })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.error) {
        console.error('Error moving video:', data.error);
        card.style.opacity = "1";
        alert('Failed to move video: ' + data.error);
      } else {
        console.log('Video moved successfully to ' + targetCategory);
        card.dataset.categories = JSON.stringify([targetCategory]);
        const tagContainer = card.querySelector('.tag-container');
        if (tagContainer) {
          tagContainer.innerHTML = targetCategory 
            ? `<span class="category-tag">${targetCategory}</span>` 
            : '';
        }
        fetchHistory().then(() => {
          card.style.opacity = "1";
          filterHistoryByCategory();
          adjustColumnCount();
        }).catch(err => {
          console.error("Error refreshing history:", err);
          card.style.opacity = "1";
        });
      }
    })
    .catch(error => {
      console.error('Error:', error);
      card.style.opacity = "1";
      alert('Failed to move video: ' + error.message);
    });
}

function saveCategories() {
  const tabs = Array.from(document.querySelectorAll('.category-tab:not(.add-tab):not([data-category=""])'));
  const categories = tabs.map(tab => tab.dataset.category);
  localStorage.setItem('videoCategories', JSON.stringify(categories));
}

async function createCategory() {
  const name = document.getElementById("categoryNameInput").value.trim();
  if (!name) return;
  await fetch('/api/categories', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({name})
  });
  addCategoryTab(name);
  switchCategory(name);
  closeCategoryPrompt();
}

function closeCategoryPrompt() {
  document.getElementById("categoryPrompt").style.display = "none";
  document.getElementById("overlay").style.display = "none";
}

// Performance and Layout

function optimizeVideoLoading() {
  const videos = document.querySelectorAll('.history-card video');
  videos.forEach(video => {
    video.setAttribute('preload', 'metadata');
    video.setAttribute('loading', 'lazy');
    video.setAttribute('decoding', 'async');
  });
}

// Balance and API Key Management
async function checkFalBalance() {
  try {
    const response = await fetch('/api/fal-balance');
    const balanceElement = document.querySelector('.balance-amount');
    if (response.ok) {
      const data = await response.json();
      balanceElement.textContent = data.balance !== undefined 
        ? parseFloat(data.balance).toFixed(2) 
        : "--";
    } else {
      balanceElement.textContent = "--";
    }
  } catch (error) {
    console.error('Balance fetch error:', error);
    document.querySelector('.balance-amount').textContent = "--";
  }
}

function clearAllCaching() {
  console.log("🧹 Clearing all cached data...");
  localStorage.removeItem('activeTasks');
  localStorage.removeItem('videoCategories');
  localStorage.removeItem('lastUsedImage');
  localStorage.removeItem('lastUsedImageName');
  sessionStorage.clear();
  
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const bustCache = (typeof url === 'string') ? 
      url + (url.includes('?') ? '&' : '?') + '_nocache=' + Date.now() :
      url;
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      options.headers.append('Cache-Control', 'no-cache, no-store, must-revalidate');
      options.headers.append('Pragma', 'no-cache');
      options.headers.append('Expires', '0');
    } else {
      options.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      options.headers['Pragma'] = 'no-cache';
      options.headers['Expires'] = '0';
    }
    return originalFetch(bustCache, options);
  };

  const metaNoCache = document.createElement('meta');
  metaNoCache.httpEquiv = 'Cache-Control';
  metaNoCache.content = 'no-cache, no-store, must-revalidate';
  document.head.appendChild(metaNoCache);
  
  const metaPragma = document.createElement('meta');
  metaPragma.httpEquiv = 'Pragma';
  metaPragma.content = 'no-cache';
  document.head.appendChild(metaPragma);
  
  const metaExpires = document.createElement('meta');
  metaExpires.httpEquiv = 'Expires';
  metaExpires.content = '0';
  document.head.appendChild(metaExpires);
  
  console.log("✅ Cache clearing complete!");
}

function loadLastUsedImage() {
  const lastImage = localStorage.getItem('lastUsedImage');
  const lastImageName = localStorage.getItem('lastUsedImageName');
  if (lastImage && lastImageName) {
    fetch(lastImage)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], lastImageName, { type: blob.type });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;
        displayThumbnail(file);
      })
      .catch(err => console.error("Error loading last used image:", err));
  }
}

function copySettings(requestId, button) {
  fetch("/api/history")
    .then(response => response.json())
    .then(data => {
      let allData = [];
      if (Array.isArray(data)) {
        allData = data;
      } else if (data.videos && Array.isArray(data.videos)) {
        allData = data.videos;
      }
      
      const item = allData.find(entry => entry.request_id === requestId);
      if (item) {
        loadLastSettings(item);
        button.style.backgroundColor = "#4caf50";
        setTimeout(() => {
          button.style.transition = "background-color 1s";
          button.style.backgroundColor = "";
        }, 1000);
      } else {
        console.error("Could not find item with ID:", requestId);
      }
    });
}

function loadLastSettings(item) {
  document.getElementById("prompt").value = item.prompt || "";
  document.getElementById("resolution").value = item.resolution || "1080p";
  document.getElementById("duration").value = item.duration || 5;
  document.getElementById("motion_intensity").value = item.motion_intensity || "medium";
  document.getElementById("seed").value = item.seed || "";
  document.getElementById("guidance_scale").value = item.guidance_scale || 7.5;
  document.getElementById("num_inference_steps").value = item.num_inference_steps || 50;
  document.getElementById("frame_rate").value = item.frame_rate || 30;
  document.getElementById("negative_prompt").value = item.negative_prompt || "";
  document.getElementById("shift").value = item.shift || 2.0;
  if (item.cfm_scale) document.getElementById("cfm_scale").value = item.cfm_scale;
  if (item.motion_bucket_id) document.getElementById("motion_bucket_id").value = item.motion_bucket_id;
  if (item.noise_aug_strength) document.getElementById("noise_aug_strength").value = item.noise_aug_strength;
  if (item.midas_depth_warp) document.getElementById("midas_depth_warp").value = item.midas_depth_warp;
  document.getElementById('cfm_scale_value').textContent = document.getElementById('cfm_scale').value;
  document.getElementById('noise_aug_strength_value').textContent = document.getElementById('noise_aug_strength').value;
  document.getElementById('midas_depth_warp_value').textContent = document.getElementById('midas_depth_warp').value;
  if (item.image_path) {
    const fileName = item.image_path.split('/').pop();
    fetch(`/input/${fileName}`)
      .then(response => response.blob())
      .then(blob => {
        const file = new File([blob], fileName, { type: blob.type });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;
        displayThumbnail(file);
      })
      .catch(error => {
        console.error("Error loading thumbnail:", error);
      });
  }
}

// Profile Menu & API Key Management
function setupProfileMenu() {
  const profileIcon = document.getElementById('profileIcon');
  const profileDropdown = document.getElementById('profileDropdown');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const maskedApiKey = document.getElementById('maskedApiKey');
  const showApiKeyBtn = document.getElementById('showApiKey');
  
  const savedApiKey = localStorage.getItem('falApiKey');
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
    maskedApiKey.textContent = maskApiKey(savedApiKey);
  }
  
  profileIcon.addEventListener('click', function(e) {
    e.stopPropagation();
    profileDropdown.style.display = profileDropdown.style.display === 'block' ? 'none' : 'block';
  });
  
  document.addEventListener('click', function(e) {
    if (!profileIcon.contains(e.target) && !profileDropdown.contains(e.target)) {
      profileDropdown.style.display = 'none';
    }
  });
  
  apiKeyInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveApiKey();
      profileDropdown.style.display = 'none';
    }
  });
  
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  
  function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      localStorage.setItem('falApiKey', apiKey);
      maskedApiKey.textContent = maskApiKey(apiKey);
      fetch('/api/update-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('API key updated successfully!');
            profileDropdown.style.display = 'none';
          } else {
            alert('Failed to update API key on server');
          }
        })
        .catch(error => {
          console.error('Error updating API key:', error);
          alert('Error updating API key');
        });
    }
  }
  
  let isVisible = false;
  showApiKeyBtn.addEventListener('click', function() {
    isVisible = !isVisible;
    if (isVisible) {
      maskedApiKey.textContent = apiKeyInput.value || 'Not set';
      showApiKeyBtn.textContent = '🔒';
    } else {
      maskedApiKey.textContent = maskApiKey(apiKeyInput.value);
      showApiKeyBtn.textContent = '👁️';
    }
  });
  
  function maskApiKey(key) {
    if (!key) return 'Not set';
    return '•'.repeat(Math.min(key.length, 20));
  }
}

window.addEventListener('load', function() {
  clearAllCaching();
  makeTextareasExpandable();
  makeTagsClickable();
  updateEstimatedCost();
  fetchHistory();
  setupProfileMenu();
  optimizeVideoLoading();
  checkFalBalance();
  
  // Clear old active tasks to stop polling spam
  localStorage.removeItem('activeTasks');
  window.activePolls = {};

  document.getElementById('cfm_scale').addEventListener('input', function() {
    document.getElementById('cfm_scale_value').textContent = this.value;
  });
  document.getElementById('noise_aug_strength').addEventListener('input', function() {
    document.getElementById('noise_aug_strength_value').textContent = this.value;
  });
  document.getElementById('midas_depth_warp').addEventListener('input', function() {
    document.getElementById('midas_depth_warp_value').textContent = this.value;
  });

  document.getElementById('addCategoryTab').addEventListener('click', () => {
    overlay.style.display = 'block';
    categoryPrompt.style.display = 'block';
    const categoryInput = document.getElementById('categoryNameInput');
    categoryInput.focus();
  });

  document.getElementById('categoryNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createCategory();
    }
  });

  setTimeout(debugVideos, 2000);
  setInterval(fetchHistory, 30000); // Refresh history every 30 seconds
});

setInterval(cleanupOldTasks, 3600000);

function cleanupOldTasks() {
  const tasks = JSON.parse(localStorage.getItem('activeTasks') || '[]');
  const currentTime = Math.floor(Date.now() / 1000);
  const filteredTasks = tasks.filter(task => 
    currentTime - task.timestamp < 86400
  );
  localStorage.setItem('activeTasks', JSON.stringify(filteredTasks));
}

function debugVideos() {
  console.log("Debugging videos...");
  // Add any diagnostic logic here if needed
}