/* SKY EV – shared logic (vanilla JS; products are stored in your GoDaddy MySQL database via api.php) */
(function () {
  "use strict";

  var WHATSAPP = "61428796970"; // <- WhatsApp number, digits only with country code
  var CDN = "https://dao000pg6obv7.cloudfront.net/wp-content/uploads";
    var LOGO = "/images/logo.png";
  var LOGO_VIDEO = "/images/newLogo.webm";

  /* DEFAULT product – shown only while the database is still empty/new, or if the server can't be reached */
   var SEED = [
    {
      "id": "4-5-electric-pantech",
      "name": "4.5 Electric Pantech",
      "price": 98000,
      "priceNote": "Plus on-road costs",
      "booking": 5000,
      "createdAt": 1700000000000,
      "description": "LIFT YOUR GAME!\n\nELECTRIC TRUCK AT DIESEL TRUCK PRICE.\n\nMORE PAYLOAD. LOWER RUNNING COSTS.\n\nIntroducing the LDV eDeliver 9, Australia's lightest 4.5-tonne electric Pantech truck, combining exceptional payload capacity, outstanding value for money and the benefits of zero-emission transport.\n\nCheaper than Japanese Euro 6 diesel trucks, with more payload and significantly lower running costs.\n\nBuilt for Australian businesses, the eDeliver 9 combines modern electric vehicle technology with DROPTRUCK's lightweight body engineering, delivering a practical, work-ready solution that helps businesses carry more and spend less.\n\nForget expensive diesel, and costly engine maintenance. Make the switch to electric and put those savings straight back into your business.\n\nWhy pay more for a diesel truck when you can drive electric for less?\n\n",
      "images": [
        "https://dao000pg6obv7.cloudfront.net/wp-content/uploads/2026/09/04141105/08_20260904.webp"
      ],
      "specs": [
        [
          "GVM",
          "4,500 kg"
        ],
        [
          "Weight",
          "3,015 kg (including 650 kg Pantech body)"
        ],
        [
          "Payload",
          "1,485 kg"
        ],
        [
          "Battery",
          "88.8 kWh LFP"
        ],
        [
          "Drive System",
          "Rear Wheel Drive / Electric"
        ],
        [
          "Motor",
          "PMS 170 kW / 330 Nm"
        ],
        [
          "Top speed",
          "105 km/h"
        ],
        [
          "Wheelbase",
          "4,048 mm"
        ],
        [
          "DC Fast Charging",
          "90 kW"
        ],
        [
          "AC Charging",
          "11 kW three-phase / 7 kW single-phase"
        ],
        [
          "Odometer",
          "50 km"
        ],
        [
          "Box",
          "4.2 m"
        ],
        [
          "Doors",
          "Barn doors"
        ],
        [
          "Taillift",
          "N/A"
        ],
        [
          "Availability",
          "6 weeks"
        ],
        [
          "Range",
          "Up to 235 km WLTP (small box configuration)"
        ],
        [
          "Year",
          "2027"
        ]
      ]
    }
  ];

  
  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /* ===== DATA LIVES IN YOUR GODADDY DATABASE (MySQL), read/written through api.php =====
     api.php must be uploaded next to these files (see SETUP-GODADDY-DATABASE.md).
     If you ever host the pages on a different domain, put the full address of api.php here,
     e.g. "https://yourdomain.com/api.php" - the data stays safe in your database. */
  var API_URL = "api.php";
  var CACHE = "sky_last_products"; // last good copy in the visitor's browser (used only if Google is unreachable)

  /* Uploaded files are stored as "/uploads/..." (no domain). If api.php lives on another domain, add that domain when loading. */
  var API_ORIGIN = (String(API_URL).match(/^https?:\/\/[^\/]+/i) || [""])[0];
  function fixUrl(u) {
    return API_ORIGIN && typeof u === "string" && u.charAt(0) === "/" && u.charAt(1) !== "/" ? API_ORIGIN + u : u;
  }
  function unfixUrl(u) {
    return API_ORIGIN && typeof u === "string" && u.indexOf(API_ORIGIN + "/") === 0 ? u.slice(API_ORIGIN.length) : u;
  }
  function mapUrls(list, fn) {
    return list.map(function (p) {
      var q = {};
      for (var k in p) q[k] = p[k];
      q.images = (p.images || []).map(fn);
      q.videos = (p.videos || []).map(function (v) {
        return { url: fn(v.url), kind: v.kind, thumb: fn(v.thumb || "") };
      });
      return q;
    });
  }

  function configured() {
    return !!API_URL;
  }

  /* Every visitor, on every domain, loads the same list from your database. */
  function load() {
    if (!configured()) return Promise.resolve(clone(SEED));
    return fetch(API_URL + (API_URL.indexOf("?") < 0 ? "?" : "&") + "action=list&t=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || d.ok === false) throw new Error((d && d.error) || "bad response");
        var list = Array.isArray(d.list) ? mapUrls(d.list, fixUrl) : clone(SEED); // empty/new database -> default product
        try {
          localStorage.setItem(CACHE, JSON.stringify(list));
        } catch (e) {}
        return list;
      })
      .catch(function () {
        try {
          var c = JSON.parse(localStorage.getItem(CACHE));
          if (Array.isArray(c)) return c;
        } catch (e) {}
        return clone(SEED);
      });
  }

  /* ---- admin helpers (the passcode is checked in api.php using ADMIN_PIN from config.php) ---- */
  function pin() {
    try {
      return sessionStorage.getItem("skyPin") || "";
    } catch (e) {
      return "";
    }
  }
  function call(payload) {
    if (!configured()) {
      return Promise.resolve({ ok: false, d: { error: "The API address is not set (API_URL in app.js)." } });
    }
    payload.pin = pin();
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // plain text keeps this a "simple" request (no CORS preflight)
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {
            ok: false,
            error:
              r.status === 413
                ? "The file is bigger than your server allows. Use a smaller file, or paste a YouTube / Google Drive link."
                : "Server error (" + r.status + "). Check that api.php and config.php are uploaded correctly.",
          };
        });
      })
      .then(function (d) {
        return { ok: !!(d && d.ok), d: d || {} };
      })
      .catch(function () {
        return { ok: false, d: { error: "Cannot reach api.php. Check that api.php and config.php are uploaded and the database details are correct." } };
      });
  }
  function login(p) {
    p = String(p || "").trim();
    try {
      sessionStorage.setItem("skyPin", p);
    } catch (e) {}
    return call({ action: "check" }).then(function (r) {
      if (!r.ok) {
        try {
          sessionStorage.removeItem("skyPin");
        } catch (e) {}
      }
      return r;
    });
  }
  function save(list) {
    return call({ action: "save", list: mapUrls(list, unfixUrl) });
  }
  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = rej;
      fr.onload = function () {
        res(String(fr.result).split(",")[1] || "");
      };
      fr.readAsDataURL(blob);
    });
  }
  /* photos and videos are saved in the "uploads" folder on your hosting */
  function upload(blob) {
    return toBase64(blob).then(function (data) {
      return call({ action: "upload", type: blob.type, data: data }).then(function (r) {
        if (!r.ok) throw new Error(r.d.error || "Upload failed.");
        return fixUrl(r.d.url);
      });
    });
  }
  function uploadImage(blob) {
    return upload(blob);
  }
  function uploadVideo(file) {
    return upload(file);
  }

  /* Recognise a video link: YouTube, Vimeo, Google Drive, or a direct video file (.mp4 / .webm) */
  function parseVideo(u) {
    u = String(u || "").trim();
    if (!/^https?:\/\//i.test(u) && (u.charAt(0) !== "/" || u.charAt(1) === "/")) return null;
    var m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/i);
    if (m) return { kind: "youtube", id: m[1], thumb: "https://img.youtube.com/vi/" + m[1] + "/hqdefault.jpg" };
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { kind: "vimeo", id: m[1], thumb: "https://vumbnail.com/" + m[1] + ".jpg" };
    m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/i);
    if (m) return { kind: "drive", id: m[1], thumb: "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1000" };
    return { kind: "file" };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function money(n) {
    return (
      "$" +
      Number(n || 0).toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  function money0(n) {
    return "$" + Number(n || 0).toLocaleString("en-AU", { maximumFractionDigits: 2 });
  }
  function newest(list) {
    return list.slice().sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });
  }
  function slugify(t) {
    return (
      String(t)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "product"
    );
  }
  function url(p) {
    return "product.html?id=" + encodeURIComponent(p.id);
  }

  function cardHTML(p) {
    var img = (p.images && p.images[0]) || "";
    var specs = (p.specs || [])
      .slice(0, 3)
      .map(function (s) {
        return "<li><i class='fa-regular fa-circle-check'></i> <b>" + esc(s[0]) + ":</b> " + esc(s[1]) + "</li>";
      })
      .join("");
    return (
      '<article class="card"><a class="img" href="' +
      url(p) +
      '"><img loading="lazy" src="' +
      esc(img) +
      '" alt="' +
      esc(p.name) +
      '"></a>' +
      '<div class="body"><h3><a href="' +
      url(p) +
      '">' +
      esc(p.name) +
      "</a></h3>" +
      '<div class="' +
      (specs ? "row" : "") +
      '"><div class="left"><span class="price">' +
      money(p.price) +
      "</span>" +
      '<a class="btn sm" href="' +
      url(p) +
      '">Details</a></div>' +
      (specs ? '<ul class="spec">' + specs + "</ul>" : "") +
      "</div></div></article>"
    );
  }
  function renderCards(sel, limit, list) {
    var el = document.querySelector(sel);
    if (!el) return;
    (list ? Promise.resolve(list) : load()).then(function (all) {
      var items = newest(all);
      if (limit) items = items.slice(0, limit);
      el.innerHTML = items.length
        ? items.map(cardHTML).join("")
        : '<p class="empty">No products yet.</p>';
    });
  }

  /* ---------- header / footer for inner pages ---------- */
  var cartSvg =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';
  function chrome() {
    var page = location.pathname.split("/").pop();
    var inProducts = page.indexOf("product") === 0;
    var inAbout = page.indexOf("about") === 0;
    var h = document.getElementById("site-header");
    if (h) {
           h.outerHTML =
  '<header class="solid"><div class="hwrap">' +
  '<a href="/" class="logoGrid"><video loop autoplay muted playsinline><source src="' + LOGO_VIDEO + '"></video></a>' +
  '<a class="logo" href="/"><img src="' + LOGO + '" alt="SKY"></a>' +
  '<button class="burger" id="bg" aria-label="Menu">☰</button><nav id="nv"><ul>' +
  '<li><a href="index.html">Home</a></li><li><a href="index.html#about">About Us</a></li>' +
  "<li><a " + (inProducts ? 'class="on" ' : "") + 'href="products.html">Products</a></li>' +
  '<li><a href="index.html#gallery">Gallery</a></li><li><a href="index.html#contact">Contact Us</a></li>' +
  '<li><a class="cart" href="#" aria-label="Cart">' + cartSvg + "<b>0</b></a></li></ul></nav></div></header>";
      var nv = document.getElementById("nv");
      document.getElementById("bg").onclick = function () {
        nv.classList.toggle("open");
      };
    }
    var f = document.getElementById("site-footer");
    if (f) {
      f.outerHTML =
        '<footer><div class="wrap"><div class="fgrid">' +
        '<div><a class="logo" href="/"><img src="' +
        LOGO +
        '" alt="SKY"></a>' +
        '<p class="about-t">Specialising in commercial electric vehicles. The SKY brand stands for quality, reliability, and the confidence your business depends on.</p></div>' +
        '<div><h5>Useful Links</h5><ul><li><a href="index.html">Home</a></li><li><a href="index.html#about">About Us</a></li><li><a href="products.html">Product</a></li><li><a href="index.html#gallery">Gallery</a></li><li><a href="index.html#contact">Contact Us</a></li></ul></div>' +
        '<div><h5>Contact Us</h5><ul><li><a href="tel:+61428796970">+61 428796970</a></li><li><a href="mailto:info@skyev.com.au">info@skyev.com.au</a></li><li>4 Chiltern Rd Ingleside, NSW 2101</li></ul></div>' +
        '<div><h5>Legal Links</h5><ul><li><a href="#">Privacy Policy</a></li><li><a href="#">Refund Policy</a></li><li><a href="#">Cookie Policy</a></li></ul></div>' +
        '</div><div class="copy">SKY® is a registered trademark of SKYEV PTY LTD.<br>© 2026 SKYEV PTY LTD. All rights reserved.</div></div></footer>';
    }
  }
  document.addEventListener("DOMContentLoaded", function () {
    chrome();
  });

  window.SKY = {
    load: load,
    save: save,
    loadAdmin: load,
    login: login,
    uploadImage: uploadImage,
    uploadVideo: uploadVideo,
    parseVideo: parseVideo,
    defaults: function () {
      return clone(SEED);
    },
    money0: money0,
    esc: esc,
    money: money,
    newest: newest,
    slugify: slugify,
    cardHTML: cardHTML,
    renderCards: renderCards,
    WA: WHATSAPP,
  };
})();
