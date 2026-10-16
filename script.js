// Echo landing page: Dark / Light screenshot switch, and the download link from Echo's update feed.

(function () {
    var root = document.documentElement;
    var shots = document.querySelectorAll("img[data-shot]");

    function showShots(theme, animate) {
        shots.forEach(function (img) {
            var src = "screenshots/" + theme + "-" + img.dataset.shot + ".png";
            if (img.getAttribute("src") === src) return;
            if (!animate) {
                img.src = src;
                return;
            }
            // Fade out, swap once the new image has loaded, fade back in
            img.classList.add("swapping");
            var next = new Image();
            next.onload = next.onerror = function () {
                setTimeout(function () {
                    img.src = src;
                    img.classList.remove("swapping");
                }, 150);
            };
            next.src = src;
        });
    }

    function setTheme(theme, animate) {
        root.dataset.theme = theme;
        showShots(theme, animate);
    }

    setTheme(root.dataset.theme || "dark", false);

    document.querySelector(".theme-toggle").addEventListener("click", function () {
        var theme = root.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem("echo-theme", theme);
        setTheme(theme, true);
    });

    // Follow the system appearance live, unless the visitor picked a theme themselves
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (event) {
        if (localStorage.getItem("echo-theme")) return;
        setTheme(event.matches ? "light" : "dark", true);
    });

    // The newest release is the first item in Echo's Sparkle appcast (same github.io site, so no CORS issue).
    // If it can't be read, the links keep pointing at the latest release page.
    fetch("/Updates/echo/appcast.xml", { cache: "no-cache" })
        .then(function (response) {
            if (!response.ok) throw new Error(response.status);
            return response.text();
        })
        .then(function (text) {
            var xml = new DOMParser().parseFromString(text, "application/xml");
            var item = xml.querySelector("item");
            var enclosure = item && item.querySelector("enclosure");
            if (!enclosure) return;
            var url = enclosure.getAttribute("url");
            var version = item.getElementsByTagNameNS("http://www.andymatuschak.org/xml-namespaces/sparkle", "shortVersionString")[0];
            document.querySelectorAll(".download-link").forEach(function (link) {
                link.href = url;
            });
            if (version) {
                document.querySelector(".version").textContent = "Free · Version " + version.textContent;
            }
        })
        .catch(function () {});
})();
