const { test, expect } = require("@playwright/test");
const { launchWithExtension } = require("./extension.fixtures");

// Shared helpers for the settings page and side panel redesign spec.
// The visual work is CSS only, so these assert computed styles that prove the
// shared glass primitives actually landed on each surface.

async function openSettings(context, sw, theme) {
  const page = await context.newPage();
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/settings.html`);
  if (theme) {
    await page.evaluate((value) => chrome.storage.sync.set({ omni_ai_theme: value }), theme);
    await page.reload();
    if (theme === "light") {
      await expect(page.locator("html")).toHaveClass(/omni-ai-light-mode/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/omni-ai-light-mode/);
    }
  }
  return page;
}

test("settings page paints the glass shell on the page backdrop", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);

    const backdrop = await page.evaluate(
      () => getComputedStyle(document.body, "::before").backgroundImage,
    );
    expect(backdrop).toContain("radial-gradient");

    await expect(page.locator(".header-content.ds-surface")).toHaveCount(1);
    const headerFilter = await page.evaluate(
      () => getComputedStyle(document.querySelector(".header-content")).backdropFilter,
    );
    expect(headerFilter).not.toBe("none");

    const card = page.locator(".setting-card.ds-surface").first();
    await expect(card).toBeVisible();
    const cardFilter = await card.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(cardFilter).not.toBe("none");

    await expect(page.locator(".section-icon svg")).toHaveCount(5);
    const iconText = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".section-icon"))
        .map((el) => el.textContent.trim())
        .join(""),
    );
    expect(iconText).toBe("");
  } finally {
    await context.close();
  }
});

test("settings page flips its glass surface between themes", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const surfaces = {};
    for (const theme of ["dark", "light"]) {
      const page = await openSettings(context, sw, theme);
      surfaces[theme] = await page.evaluate(
        () => getComputedStyle(document.querySelector(".setting-card.ds-surface")).backgroundColor,
      );
      await page.close();
    }
    // Both branches are pinned: an empty profile only ever renders light, so a
    // dark-only regression would otherwise ship green.
    expect(surfaces.dark).toBe("rgba(30, 30, 40, 0.92)");
    expect(surfaces.light).toBe("rgba(255, 255, 255, 0.84)");
  } finally {
    await context.close();
  }
});

test("settings fields, flash pills and save bar wear the new material", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await expect(page.locator("#apiModel")).toHaveClass(/ds-field/);
    await expect(page.locator("#saveBtn")).toHaveClass(/ds-btn-primary/);

    const barFilter = await page.evaluate(
      () => getComputedStyle(document.querySelector(".save-actions")).backdropFilter,
    );
    expect(barFilter).not.toBe("none");

    const chip = page.locator(".flash-action-option.ds-pill").first();
    await chip.locator("input").check();
    const selected = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(selected).not.toBe("rgba(0, 0, 0, 0)");
  } finally {
    await context.close();
  }
});

test("a save status does not grow the save bar", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await page.setViewportSize({ width: 900, height: 900 });
    const before = await page.locator(".save-actions").boundingBox();
    await page.evaluate(() => {
      const status = document.getElementById("saveStatus");
      status.textContent = "Changes saved";
      status.classList.add("visible");
    });
    const after = await page.locator(".save-actions").boundingBox();
    expect(after.height).toBe(before.height);
  } finally {
    await context.close();
  }
});

test("settings page honours reduced motion", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".settings-section"))
        .map((el) => getComputedStyle(el).animationDuration)
        .join(","),
    );
    expect(durations.split(",").every((duration) => duration === "0s")).toBe(true);
  } finally {
    await context.close();
  }
});

async function openPanel(context, sw, theme) {
  const page = await context.newPage();
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
  if (theme) {
    await page.evaluate((value) => chrome.storage.sync.set({ omni_ai_theme: value }), theme);
    await page.reload();
    if (theme === "light") {
      await expect(page.locator("html")).toHaveClass(/omni-ai-light-mode/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/omni-ai-light-mode/);
    }
  }
  return page;
}

test("side panel shell is glass and its tabs are a segmented pill", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    const shell = await page.evaluate(
      () => getComputedStyle(document.querySelector(".sidepanel-container")).backdropFilter,
    );
    expect(shell).not.toBe("none");

    const active = page.locator("#tabChat");
    const bg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(await active.getAttribute("aria-selected")).toBe("true");

    await expect(page.locator(".tab-icon svg")).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test("side panel glass flips between themes", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const surfaces = {};
    for (const theme of ["dark", "light"]) {
      const page = await openPanel(context, sw, theme);
      surfaces[theme] = await page.evaluate(
        () => getComputedStyle(document.querySelector(".sidepanel-container")).backgroundColor,
      );
      await page.close();
    }
    expect(surfaces.dark).toBe("rgba(30, 30, 40, 0.92)");
    expect(surfaces.light).toBe("rgba(255, 255, 255, 0.84)");
  } finally {
    await context.close();
  }
});

test("the panel does not overflow at 280px with the longest shipped labels", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    await page.locator("#tabTools").click();
    // The default locale is English ("Chat", "Tools"), which never exercises
    // the narrow case. Use the shipped German strings, the longest of the 52
    // catalogues for these labels.
    await page.evaluate(() => {
      document.querySelector("#tabChat .tab-label").textContent = "Chat";
      document.querySelector("#tabTools .tab-label").textContent = "Werkzeuge";
      document.querySelector("#summarizeBtn .action-label").textContent = "Zusammenfassen";
      document.querySelector("#translateBtn .action-label").textContent =
        "Intelligente Übersetzung";
      document.querySelector("#explainBtn .action-label").textContent = "Erklären";
    });
    await page.setViewportSize({ width: 280, height: 700 });

    const overflow = await page.evaluate(() => ({
      horizontal:
        document.querySelector(".tab-nav").scrollWidth >
        document.querySelector(".tab-nav").clientWidth + 1,
      doc: document.documentElement.scrollWidth > window.innerWidth + 1,
      pills: Array.from(document.querySelectorAll(".action-buttons .ds-pill")).some(
        (el) => el.scrollWidth > el.clientWidth + 1,
      ),
    }));
    expect(overflow.horizontal).toBe(false);
    expect(overflow.doc).toBe(false);
    expect(overflow.pills).toBe(false);
  } finally {
    await context.close();
  }
});

test("tools read as pills, loading shimmers and results wear the glass", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    await page.locator("#tabTools").click();

    const btn = page.locator("#summarizeBtn");
    await expect(btn).toHaveClass(/ds-pill/);
    const radius = await btn.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).not.toBe("0px");

    await page.evaluate(() => {
      document.getElementById("loadingSpinner").classList.remove("hidden");
    });
    // #loadingSpinner is the .ds-shimmer element itself, so its lines are
    // its own children, not grandchildren.
    await expect(page.locator("#loadingSpinner.ds-shimmer span")).toHaveCount(3);

    await page.evaluate(() => {
      document.getElementById("resultArea").classList.remove("hidden");
    });
    const filter = await page
      .locator("#resultArea")
      .evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(filter).not.toBe("none");

    await page.setViewportSize({ width: 280, height: 700 });
    const overflows = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".action-buttons .ds-pill")).some(
        (el) => el.scrollWidth > el.clientWidth + 1,
      ),
    );
    expect(overflows).toBe(false);
  } finally {
    await context.close();
  }
});

test("a long tool result scrolls and its card is drawn whole", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    for (const theme of ["light", "dark"]) {
      const page = await openPanel(context, sw, theme);
      await page.setViewportSize({ width: 400, height: 640 });
      await page.locator("#tabTools").click();
      await page.evaluate(() => {
        document.getElementById("resultArea").classList.remove("hidden");
        document.getElementById("resultText").textContent = "A sentence of the summary. ".repeat(
          160,
        );
      });

      // The whole result is reachable: the panel scrolls to the card's end.
      const reach = await page.evaluate(() => {
        const scroller = document.querySelector(".page-tools");
        scroller.scrollTop = scroller.scrollHeight;
        const card = document.getElementById("resultArea").getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        return {
          scrolls: scroller.scrollHeight > scroller.clientHeight,
          gap: card.bottom - view.bottom,
        };
      });
      expect(reach.scrolls, theme).toBe(true);
      expect(reach.gap, theme).toBeLessThanOrEqual(0);

      // Nothing between the card and the scroller clips its edges or shadow.
      const clippers = await page.evaluate(() => {
        const found = [];
        let el = document.getElementById("resultArea").parentElement;
        while (el && !el.classList.contains("page-tools")) {
          if (getComputedStyle(el).overflow !== "visible") found.push(el.id || el.className);
          el = el.parentElement;
        }
        return found;
      });
      expect(clippers, theme).toEqual([]);

      // The card's edge reads against the panel: its border is not the panel
      // colour itself (a white hairline vanished on the light panel).
      const edge = await page.evaluate(() => {
        const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const over = (fg, bg) => {
          const a = fg.length > 3 ? fg[3] : 1;
          return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        };
        const lum = (rgb) => {
          const [r, g, b] = rgb.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const panel = getComputedStyle(document.querySelector(".sidepanel-container"));
        const base = over(parse(panel.backgroundColor), [255, 255, 255]);
        const border = over(
          parse(getComputedStyle(document.getElementById("resultArea")).borderLeftColor),
          base,
        );
        const [hi, lo] = [lum(border), lum(base)].sort((a, b) => b - a);
        return (hi + 0.05) / (lo + 0.05);
      });
      expect(edge, theme).toBeGreaterThan(1.1);
      await page.close();
    }
  } finally {
    await context.close();
  }
});

test("chat is a transcript: the user message is a pill, the reply plain text", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    await page.evaluate(() => {
      const list = document.getElementById("chatMessages");
      const user = document.createElement("div");
      user.className = "chat-msg user";
      user.textContent = "Hello";
      const assistant = document.createElement("div");
      assistant.className = "chat-msg assistant";
      assistant.textContent = "Hi there";
      list.append(user, assistant);
    });

    const userStyle = await page.locator(".chat-msg.user").evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, radius: s.borderRadius };
    });
    // Theme-agnostic: headless Chromium resolves the light tokens by default,
    // so pin "a fill exists" rather than one theme's exact value.
    expect(userStyle.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(userStyle.radius).not.toBe("0px");

    const assistantBg = await page
      .locator(".chat-msg.assistant")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(assistantBg).toBe("rgba(0, 0, 0, 0)");
  } finally {
    await context.close();
  }
});

test("side panel honours reduced motion", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dots = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "thinking-dot";
      document.body.appendChild(el);
      const duration = getComputedStyle(el).animationDuration;
      el.remove();
      return duration;
    });
    expect(parseFloat(dots)).toBeGreaterThanOrEqual(2);

    // The loading skeleton slows rather than sweeping at full speed.
    const shimmer = await page.evaluate(() => {
      const wrap = document.createElement("div");
      wrap.className = "ds-shimmer";
      wrap.innerHTML = "<span></span>";
      document.body.appendChild(wrap);
      const duration = getComputedStyle(wrap.firstElementChild).animationDuration;
      wrap.remove();
      return duration;
    });
    expect(parseFloat(shimmer)).toBeGreaterThanOrEqual(2);

    // No press scale on the tabs or the tool rows.
    await page.locator("#tabTools").click();
    const pressScale = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const transform = await page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).transform);
      await page.mouse.up();
      return transform;
    };
    expect(await pressScale("#summarizeBtn")).toBe("none");
    expect(await pressScale("#tabTools")).toBe("none");
  } finally {
    await context.close();
  }
});

test("a keyboard focus ring is visible on the tool pills", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    await page.locator("#tabTools").click();

    // Tab moves focus, which is what makes Chromium match :focus-visible.
    let focused = "";
    for (let i = 0; i < 12 && focused !== "summarizeBtn"; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => document.activeElement?.id || "");
    }
    expect(focused).toBe("summarizeBtn");

    const ring = await page.evaluate(() => {
      const el = document.getElementById("summarizeBtn");
      const style = getComputedStyle(el);
      return {
        matches: el.matches(":focus-visible"),
        outline: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });

    expect(ring.matches).toBe(true);
    expect(ring.shadow !== "none" || ring.outline !== "none").toBe(true);
  } finally {
    await context.close();
  }
});

test("the chat send button matches the overlay's ask-box button", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    const send = await page.locator("#chatSend").evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        width: style.width,
        height: style.height,
        radius: style.borderRadius,
        background: style.backgroundImage,
        shadow: style.boxShadow,
        icon: getComputedStyle(el.querySelector("svg")).width,
      };
    });

    // The overlay's .omni-ai-send-btn: 24x24, 7px radius, gradient fill,
    // accent glow, 12px glyph.
    expect(send.width).toBe("24px");
    expect(send.height).toBe("24px");
    expect(send.radius).toBe("7px");
    expect(send.background).toContain("linear-gradient");
    expect(send.shadow).not.toBe("none");
    expect(send.icon).toBe("12px");

    // Same glyph as the overlay's ICONS.send (filled paper plane), not the
    // outlined Feather variant it used before.
    const glyph = await page.locator("#chatSend svg").evaluate((el) => ({
      fill: el.getAttribute("fill"),
      stroke: el.getAttribute("stroke"),
      path: el.querySelector("path")?.getAttribute("d"),
    }));
    expect(glyph.fill).toBe("currentColor");
    expect(glyph.stroke).toBe("none");
    expect(glyph.path).toBe("M2.5 2.8L22 12L2.5 21.2L6.8 12Z");

    // The geometry contract still holds with the smaller button.
    const geometry = await page.evaluate(() => {
      const wrap = document.querySelector(".chat-input-wrap").getBoundingClientRect();
      const input = document.getElementById("chatInput").getBoundingClientRect();
      const fab = document.getElementById("chatSend").getBoundingClientRect();
      return {
        wrapHeight: wrap.height,
        inputHeight: input.height,
        sendCenterY: fab.top + fab.height / 2,
        inputCenterY: input.top + input.height / 2,
      };
    });
    expect(geometry.wrapHeight).toBeCloseTo(geometry.inputHeight, 0);
    expect(geometry.sendCenterY).toBeCloseTo(geometry.inputCenterY, 0);
  } finally {
    await context.close();
  }
});

test("every status message on both surfaces shares one notice shape", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    // Read after the theme has settled, or a half-applied theme skews the
    // token values the comparison is about.
    const settings = await openSettings(context, sw, "dark");
    const fromSettings = await settings.evaluate(() => {
      const read = (el) => {
        const s = getComputedStyle(el);
        return {
          radius: s.borderRadius,
          padding: s.padding,
          fontSize: s.fontSize,
          background: s.backgroundColor,
          color: s.color,
        };
      };
      const save = document.getElementById("saveStatus");
      save.textContent = "Saved";
      save.classList.add("visible", "ds-notice--success");
      const validation = document.getElementById("validationStatus");
      validation.className = "ds-notice visible ds-notice--error";
      validation.textContent = "Failed";
      return { save: read(save), validation: read(validation) };
    });

    const panel = await openPanel(context, sw, "dark");
    const fromPanel = await panel.evaluate(() => {
      const read = (el) => {
        const s = getComputedStyle(el);
        return {
          radius: s.borderRadius,
          padding: s.padding,
          fontSize: s.fontSize,
          background: s.backgroundColor,
          color: s.color,
        };
      };
      const status = document.getElementById("statusLine");
      status.className = "status-line ds-notice ds-notice--error";
      status.textContent = "Failed";
      const error = document.getElementById("chatError");
      error.classList.remove("hidden");
      return { status: read(status), error: read(error) };
    });

    const notices = { ...fromSettings, ...fromPanel };
    const shapes = Object.values(notices).map((s) => `${s.radius}|${s.padding}|${s.fontSize}`);
    expect(new Set(shapes).size).toBe(1);

    // The three error surfaces share the same tint; the success one does not.
    expect(fromSettings.validation.background).toBe(fromPanel.status.background);
    expect(fromPanel.status.background).toBe(fromPanel.error.background);
    expect(fromSettings.save.background).not.toBe(fromPanel.status.background);
  } finally {
    await context.close();
  }
});

test("the version badge does not look clickable", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    const cursor = await page.locator("#extVersion").evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("default");
  } finally {
    await context.close();
  }
});

test("hairline rows use the separator token, not the border token", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    const colours = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      // Only a row that actually draws a hairline reports a border colour;
      // the first or last child resolves to currentColor instead.
      const row = Array.from(document.querySelectorAll(".setting-item")).find(
        (el) => getComputedStyle(el).borderBottomStyle === "solid",
      );
      return {
        separator: root.getPropertyValue("--omni-separator").trim(),
        row: row ? getComputedStyle(row).borderBottomColor : null,
      };
    });
    const probe = colours.separator.startsWith("#") ? null : colours.separator;
    expect(probe).toBeTruthy();
    expect(colours.row).toBe(probe);
  } finally {
    await context.close();
  }
});

test("a long save status clips inside the bar instead of spilling", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    await page.setViewportSize({ width: 900, height: 900 });
    const before = await page.locator(".save-actions").boundingBox();
    const clipped = await page.evaluate(() => {
      const status = document.getElementById("saveStatus");
      status.textContent =
        "Cambios guardados correctamente en todos los proveedores configurados y en los idiomas de la interfaz";
      status.classList.add("visible");
      const style = getComputedStyle(status);
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    });
    const after = await page.locator(".save-actions").boundingBox();
    expect(clipped.overflow).toBe("hidden");
    expect(clipped.textOverflow).toBe("ellipsis");
    expect(clipped.whiteSpace).toBe("nowrap");
    expect(after.height).toBe(before.height);
  } finally {
    await context.close();
  }
});

test("the stat tiles drop the backdrop filter the big panels need", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw);
    const filters = await page.evaluate(() => ({
      stat: getComputedStyle(document.querySelector(".stat-card")).backdropFilter,
      card: getComputedStyle(document.querySelector(".setting-card")).backdropFilter,
    }));
    expect(filters.stat).toBe("none");
    expect(filters.card).not.toBe("none");
  } finally {
    await context.close();
  }
});

test("the panel tabs carry their label as a tooltip for clipped locales", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openPanel(context, sw);
    const tabs = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".tab-btn")).map((btn) => ({
        title: btn.getAttribute("title"),
        label: btn.querySelector(".tab-label")?.textContent.trim(),
      })),
    );
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab.title).toBe(tab.label);
    }
  } finally {
    await context.close();
  }
});

test("the Advanced toggle in Settings uses the accent focus ring, not the browser outline", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, "light");
    // A key press first: Chromium then treats the scripted focus as keyboard
    // focus and matches :focus-visible.
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.querySelector(".advanced-settings > summary");
      el.focus();
      const style = getComputedStyle(el);
      return {
        matches: el.matches(":focus-visible"),
        outline: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });

    expect(ring.matches).toBe(true);
    expect(ring.outline).toBe("none");
    expect(ring.shadow).not.toBe("none");
  } finally {
    await context.close();
  }
});
