// app.js — Album Finder Frontend Logic
// Auto-detects whether running locally or on Vercel

const IS_LOCAL     = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const TOKEN_SERVER = IS_LOCAL ? "http://localhost:3001/token" : "/api/token";
const SPOTIFY_API  = "https://api.spotify.com/v1";

// ── DOM references ──────────────────────────────────────────
const artistInput     = document.getElementById("artistInput");
const searchBtn       = document.getElementById("searchBtn");
const errorMsg        = document.getElementById("errorMsg");
const loader          = document.getElementById("loader");

const artistSection   = document.getElementById("artistSection");
const artistImage     = document.getElementById("artistImage");
const artistName      = document.getElementById("artistName");
const artistGenres    = document.getElementById("artistGenres");
const artistFollowers = document.getElementById("artistFollowers");
const artistPopularity= document.getElementById("artistPopularity");
const albumCountEl    = document.getElementById("albumCount");

const filterSection   = document.getElementById("filterSection");
const filterBtns      = document.querySelectorAll(".filter-btn");

const albumsSection   = document.getElementById("albumsSection");
const albumsGrid      = document.getElementById("albumsGrid");

const albumModal       = document.getElementById("albumModal");
const modalClose       = document.getElementById("modalClose");
const modalAlbumImg    = document.getElementById("modalAlbumImg");
const modalAlbumType   = document.getElementById("modalAlbumType");
const modalAlbumName   = document.getElementById("modalAlbumName");
const modalAlbumSub    = document.getElementById("modalAlbumSub");
const modalLoader      = document.getElementById("modalLoader");
const modalError       = document.getElementById("modalError");
const trackList        = document.getElementById("trackList");
const modalSpotifyLink = document.getElementById("modalSpotifyLink");

// ── State ───────────────────────────────────────────────────
let accessToken  = null;
let tokenExpiry  = 0;
let allAlbums    = [];
let activeFilter = "all";

// ── Helpers ─────────────────────────────────────────────────
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function formatDuration(ms) {
  if (!ms) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
}

function clearError() {
  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");
}

function hideAll() {
  artistSection.classList.add("hidden");
  filterSection.classList.add("hidden");
  albumsSection.classList.add("hidden");
}

// ── Token ────────────────────────────────────────────────────
async function getAccessToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && accessToken && now < tokenExpiry) return accessToken;

  const res = await fetch(TOKEN_SERVER);
  const raw = await res.text();
  let data  = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Token server returned an invalid response. Please try again.");
    }
  }
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error || "Could not get Spotify token. Check your setup.");
  }

  accessToken = data.access_token;
  // Spotify tokens last 3600s; refresh a bit early to be safe.
  const ttlSeconds = data.expires_in ?? 3600;
  tokenExpiry = now + (ttlSeconds - 60) * 1000;
  return accessToken;
}

// Wraps a Spotify fetch; if it 401s (expired/invalid token), refreshes
// the token once and retries automatically. Also retries once on a
// malformed/empty body or a 429/5xx, since Spotify occasionally returns
// a blank or truncated response under load.
async function spotifyFetch(url, _retried = false) {
  let token = await getAccessToken();
  let res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401 && !_retried) {
    await getAccessToken(true);
    return spotifyFetch(url, true);
  }

  if ((res.status === 429 || res.status >= 500) && !_retried) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 1;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(url, true);
  }

  const raw = await res.text();
  let data  = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      // Body wasn't empty but also wasn't valid JSON — retry once,
      // since this is usually a transient hiccup rather than a real error.
      if (!_retried) return spotifyFetch(url, true);
      throw new Error("Spotify returned an unreadable response. Please try again.");
    }
  }

  if (!res.ok) {
    const message = data?.error?.message || `Spotify error (status ${res.status})`;
    throw new Error(message);
  }

  return data ?? {};
}

// ── Spotify API calls ────────────────────────────────────────
async function searchArtist(query) {
  const url   = `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=artist&limit=1`;
  const data  = await spotifyFetch(url);
  const artist = data.artists?.items?.[0];
  if (!artist) throw new Error(`No artist found for "${query}"`);
  return artist;
}

async function fetchAllAlbums(artistId) {
  let albums = [];
  let url = `${SPOTIFY_API}/artists/${artistId}/albums?include_groups=album,single,compilation&limit=10&market=US`;

  while (url) {
    const data = await spotifyFetch(url);
    if (Array.isArray(data.items)) albums.push(...data.items);
    url = data.next;
  }

  const seen = new Set();
  return albums.filter((a) => {
    const key = a.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchAlbumTracks(albumId) {
  let tracks = [];
  let url = `${SPOTIFY_API}/albums/${albumId}/tracks?limit=10`;

  while (url) {
    const data = await spotifyFetch(url);
    if (Array.isArray(data.items)) tracks.push(...data.items);
    url = data.next;
  }

  return tracks;
}

// ── Render ───────────────────────────────────────────────────
function renderArtist(artist, albumCount) {
  const img = artist.images?.[0]?.url || "";
  artistImage.src               = img;
  artistName.textContent        = artist.name;
  artistGenres.textContent      = artist.genres?.slice(0, 3).join(" · ") || "—";

  // Spotify's Feb 2026 Dev Mode changes removed `followers` and `popularity`
  // from artist responses, so these may simply be absent now.
  artistFollowers.textContent   = artist.followers?.total != null
    ? formatNumber(artist.followers.total)
    : "—";
  artistPopularity.textContent  = artist.popularity ?? "—";

  albumCountEl.textContent      = albumCount;
  artistSection.classList.remove("hidden");
}

function renderAlbums(albums) {
  albumsGrid.innerHTML = "";

  if (albums.length === 0) {
    albumsGrid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1">No releases found for this filter.</p>`;
    albumsSection.classList.remove("hidden");
    return;
  }

  albums.forEach((album) => {
    const year   = album.release_date?.slice(0, 4) ?? "—";
    const img    = album.images?.[0]?.url || "";
    const type   = album.album_type ?? "album";
    const tracks = album.total_tracks;

    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <img src="${img}" alt="${album.name}" loading="lazy" />
      <div class="album-card-body">
        <h3 title="${album.name}">${album.name}</h3>
        <div class="album-meta">
          <span class="album-year">${year}</span>
          <span class="album-type">${type}</span>
        </div>
        <p class="album-tracks">${tracks} track${tracks !== 1 ? "s" : ""}</p>
      </div>
    `;
    card.addEventListener("click", () => openAlbumModal(album));
    albumsGrid.appendChild(card);
  });

  albumsSection.classList.remove("hidden");
}

function applyFilter(type) {
  activeFilter = type;
  filterBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  const filtered = type === "all" ? allAlbums : allAlbums.filter((a) => a.album_type === type);
  renderAlbums(filtered);
}

// ── Album Modal ─────────────────────────────────────────────
function renderTracks(tracks) {
  trackList.innerHTML = "";

  if (tracks.length === 0) {
    trackList.innerHTML = `<p style="color:var(--muted)">No track info available.</p>`;
    return;
  }

  tracks.forEach((track) => {
    const li = document.createElement("li");
    li.className = "track-row";
    li.innerHTML = `
      <span class="track-num">${track.track_number ?? "—"}</span>
      <span class="track-name" title="${track.name}">${track.name}</span>
      ${track.explicit ? `<span class="track-explicit">E</span>` : ""}
      <span class="track-duration">${formatDuration(track.duration_ms)}</span>
    `;
    trackList.appendChild(li);
  });
}

async function openAlbumModal(album) {
  // Populate header immediately — we already have this data.
  modalAlbumImg.src     = album.images?.[0]?.url || "";
  modalAlbumImg.alt     = album.name;
  modalAlbumType.textContent = album.album_type ?? "album";
  modalAlbumName.textContent = album.name;
  const year = album.release_date?.slice(0, 4) ?? "—";
  modalAlbumSub.textContent  = `${year} · ${album.total_tracks ?? "?"} track${album.total_tracks !== 1 ? "s" : ""}`;
  modalSpotifyLink.href = album.external_urls?.spotify ?? "#";

  trackList.innerHTML = "";
  modalError.classList.add("hidden");
  modalLoader.classList.remove("hidden");
  albumModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  try {
    const tracks = await fetchAlbumTracks(album.id);
    renderTracks(tracks);
  } catch (err) {
    modalError.textContent = "⚠️ " + err.message;
    modalError.classList.remove("hidden");
  } finally {
    modalLoader.classList.add("hidden");
  }
}

function closeAlbumModal() {
  albumModal.classList.add("hidden");
  document.body.style.overflow = "";
}

// ── Main search flow ─────────────────────────────────────────
async function handleSearch() {
  const query = artistInput.value.trim();
  if (!query) return;

  clearError();
  hideAll();
  loader.classList.remove("hidden");
  searchBtn.disabled = true;
  allAlbums = [];

  try {
    const artist = await searchArtist(query);
    allAlbums    = await fetchAllAlbums(artist.id);

    renderArtist(artist, allAlbums.length);

    activeFilter = "all";
    filterBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.type === "all"));
    filterSection.classList.remove("hidden");

    renderAlbums(allAlbums);
  } catch (err) {
    showError("⚠️ " + err.message);
  } finally {
    loader.classList.add("hidden");
    searchBtn.disabled = false;
  }
}

// ── Event listeners ──────────────────────────────────────────
searchBtn.addEventListener("click", handleSearch);
artistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});
filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => applyFilter(btn.dataset.type));
});

modalClose.addEventListener("click", closeAlbumModal);
albumModal.addEventListener("click", (e) => {
  if (e.target === albumModal) closeAlbumModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !albumModal.classList.contains("hidden")) closeAlbumModal();
});
