(() => {
  const config = window.SOFTWARE_HUB_CONFIG || {};
  const owner = config.githubOwner;
  const repo = config.releasesRepo;
  const grid = document.getElementById("app-grid");
  const status = document.getElementById("status");
  const search = document.getElementById("search");
  const empty = document.getElementById("empty-state");
  const dialog = document.getElementById("app-dialog");
  let apps = [];
  let activeFilter = "all";

  const platformFromTag = tag => {
    const prefix = (tag || "").toLowerCase().split(/[\/_-]/)[0];
    return ["android", "linux", "windows"].includes(prefix) ? prefix : "other";
  };
  const platformLabel = p => ({android:"Android",linux:"Linux",windows:"Windows",other:"Otro"}[p] || "Otro");
  const iconFor = p => ({android:"A",linux:"⌘",windows:"⊞",other:"⬡"}[p] || "⬡");
  const formatDate = value => {
    if (!value) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es", {day:"numeric",month:"short",year:"numeric"}).format(new Date(value));
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function releaseToApp(release) {
    const platform = platformFromTag(release.tag_name);
    const assets = (release.assets || []).map(a => ({
      name: a.name, url: a.browser_download_url,
      size: a.size, downloads: a.download_count
    }));
    const body = (release.body || "").trim();
    const description = body.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith("#")) || "Sin descripción. Consulta las notas de esta publicación.";
    return {
      id: release.id, name: release.name || release.tag_name,
      version: release.tag_name, platform, description: description.replace(/^[-*]\s*/, ""),
      date: release.published_at, url: release.html_url, assets,
      prerelease: release.prerelease, notes: body
    };
  }

  function render() {
    const term = search.value.trim().toLowerCase();
    const filtered = apps.filter(app => {
      const matchesPlatform = activeFilter === "all" || app.platform === activeFilter;
      const haystack = `${app.name} ${app.description} ${app.version} ${app.platform}`.toLowerCase();
      return matchesPlatform && haystack.includes(term);
    });
    grid.innerHTML = filtered.map(app => `
      <article class="app-card" data-id="${app.id}" tabindex="0" role="button" aria-label="Ver ${escapeHtml(app.name)}">
        <div class="card-top"><div class="app-icon">${iconFor(app.platform)}</div><span class="platform">${platformLabel(app.platform)}</span></div>
        <h3>${escapeHtml(app.name)}</h3>
        <p>${escapeHtml(app.description)}</p>
        <div class="card-bottom"><span>${escapeHtml(app.version)}</span><b>${app.assets.length} archivo${app.assets.length === 1 ? "" : "s"} ↗</b></div>
      </article>`).join("");
    empty.classList.toggle("hidden", filtered.length !== 0);
    grid.classList.toggle("hidden", filtered.length === 0);
    document.getElementById("total-count").textContent = apps.length;
    for (const p of ["android","linux","windows"]) {
      document.getElementById(`${p}-count`).textContent = apps.filter(a => a.platform === p).length;
    }
    grid.querySelectorAll(".app-card").forEach(card => {
      const open = () => showDetails(apps.find(a => String(a.id) === card.dataset.id));
      card.addEventListener("click", open);
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  function showDetails(app) {
    if (!app) return;
    const files = app.assets.length ? app.assets.map(asset => `
      <a class="download-button" href="${escapeHtml(asset.url)}" target="_blank" rel="noopener noreferrer">
        <span>↓ &nbsp; ${escapeHtml(asset.name)}<br><small>${(asset.size / 1024 / 1024).toFixed(1)} MB · ${asset.downloads} descargas</small></span><span>Descargar ↗</span>
      </a>`).join("") : `<p class="dialog-description">Esta publicación no contiene archivos descargables.</p>`;
    document.getElementById("dialog-content").innerHTML = `
      <div class="dialog-platform">${platformLabel(app.platform)}${app.prerelease ? " · Versión preliminar" : ""}</div>
      <h2 class="dialog-title">${escapeHtml(app.name)}</h2>
      <p class="dialog-description">${escapeHtml(app.description)}</p>
      <div class="dialog-meta"><span>Versión: ${escapeHtml(app.version)}</span><span>Publicado: ${formatDate(app.date)}</span></div>
      <div class="download-list">${files}</div>
      <p style="margin-top:18px"><a class="text-link" href="${escapeHtml(app.url)}" target="_blank" rel="noopener noreferrer">Ver publicación y notas completas ↗</a></p>`;
    dialog.showModal();
  }

  async function loadReleases() {
    if (!owner || owner === "TU_USUARIO" || !repo) {
      status.textContent = "Configura tu usuario y repositorio en config.js para cargar las publicaciones. Puedes ver las instrucciones en README.md.";
      return;
    }
    try {
      const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=${Math.min(Number(config.maxReleases) || 100,100)}`;
      const response = await fetch(endpoint, {headers: {"Accept":"application/vnd.github+json"}});
      if (!response.ok) throw new Error(response.status === 404 ? "No se encontró el repositorio o no es público." : `GitHub respondió con el estado ${response.status}.`);
      const releases = await response.json();
      apps = releases.map(releaseToApp).filter(app => app.platform !== "other");
      apps.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
      status.classList.add("hidden");
      document.getElementById("updated-label").textContent = `Actualizado: ${new Date().toLocaleString("es", {dateStyle:"medium",timeStyle:"short"})}`;
      render();
      if (!apps.length) {
        status.classList.remove("hidden");
        status.textContent = "Todavía no hay publicaciones compatibles. Publica una Release con etiqueta android-, linux- o windows-.";
      }
    } catch (error) {
      status.textContent = `No se pudo cargar el catálogo: ${error.message} Comprueba que el repositorio sea público y que la configuración sea correcta.`;
    }
  }

  search.addEventListener("input", render);
  document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.toggle("active", b === button));
    activeFilter = button.dataset.filter;
    render();
  }));
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
const githubUrl = config.websiteRepoUrl || "#";

const githubLink = document.getElementById("github-link");
if (githubLink) githubLink.href = githubUrl;

const aboutGithub = document.getElementById("about-github");
if (aboutGithub) aboutGithub.href = githubUrl;

loadReleases();
})();
