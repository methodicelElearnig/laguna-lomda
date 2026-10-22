(function () {
  var DESIGN_W = 1920;
  var DESIGN_H = 1080;
  var app = document.getElementById("app");

  function scaleApp() {
    var devBar = document.getElementById("dev-bar");
    var barHeight = devBar ? devBar.offsetHeight : 0;
    var availHeight = window.innerHeight - barHeight;
    var scale = Math.min(
      window.innerWidth / DESIGN_W,
      availHeight / DESIGN_H
    );
    var left = (window.innerWidth - DESIGN_W * scale) / 2;
    var top = barHeight + (availHeight - DESIGN_H * scale) / 2;
    app.style.transform = "scale(" + scale + ")";
    app.style.left = left + "px";
    app.style.top = top + "px";
  }

  window.addEventListener("resize", scaleApp);
  scaleApp();

  var syncDevBar = null;

  function showScreen(id) {
    var screens = document.querySelectorAll(".screen");
    var prev = null;
    for (var i = 0; i < screens.length; i++) {
      if (!screens[i].hidden) {
        prev = screens[i];
      }
    }
    for (var j = 0; j < screens.length; j++) {
      screens[j].hidden = screens[j].id !== id;
    }
    if (prev && prev.id !== id) {
      var prevVideo = prev.querySelector(".video-el");
      if (prevVideo && !prevVideo.paused) {
        prevVideo.pause();
      }
    }
    if (window.history && history.replaceState) {
      history.replaceState(null, "", "#" + id);
    }
    if (syncDevBar) {
      syncDevBar(id);
    }
    var target = document.getElementById(id);
    if (window.Motion) {
      if (prev && prev !== target) {
        Motion.cancel(prev);
      }
      Motion.reveal(target);
    }
    var heading = target.querySelector("h2[tabindex='-1']");
    if (heading) {
      heading.focus();
    }
  }

  if (window.Motion) {
    Motion.reveal(document.getElementById("screen-opening"));
  }

  /* ---------- Shared correct/wrong badge for .fill-select dropdowns ----------
     Used by every fill-in-the-blank question (1b, 2a, 5): each <select> is
     wrapped in a <span class="fill-select-wrap"> that also holds a
     <span class="fill-badge">, shown as a green check / red X once checked. */
  function setFillBadge(select, ok, revealed) {
    var wrap = select.closest(".fill-select-wrap");
    if (!wrap) {
      return;
    }
    wrap.classList.toggle("revealed", !!revealed);
    wrap.classList.toggle("correct", ok && !revealed);
    wrap.classList.toggle("wrong", !ok && !revealed);
    var badge = wrap.querySelector(".fill-badge");
    if (badge) {
      badge.textContent = revealed ? "" : (ok ? "✓" : "✕");
    }
  }

  function clearFillBadge(select) {
    var wrap = select.closest(".fill-select-wrap");
    if (wrap) {
      wrap.classList.remove("correct", "wrong", "revealed");
    }
  }

  /* Arranges a fill-in-blank <select>'s real (non-placeholder) options,
     keeping the "בחרו" placeholder first: purely-numeric option sets are
     sorted ascending (small to big) so a number line reads naturally,
     everything else is shuffled (Fisher-Yates) so the correct answer isn't
     always in the same position -- re-randomized fresh on every page load. */
  function arrangeFillSelectOptions(select) {
    var options = Array.prototype.slice.call(select.options);
    var placeholder = options.shift();
    var allNumeric = options.every(function (opt) {
      return opt.value !== "" && isFinite(Number(opt.value));
    });
    if (allNumeric) {
      options.sort(function (a, b) { return Number(a.value) - Number(b.value); });
    } else {
      for (var i = options.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = options[i];
        options[i] = options[j];
        options[j] = tmp;
      }
    }
    options.forEach(function (opt) { select.appendChild(opt); });
    select.value = placeholder.value;
  }

  /* ---------- Final score (screens 1-7 only -- screen 8 is an ungraded
     open-reflection question, see q8a's own comment block, and never
     records a score) ----------
     Questions split across two screens (1/1ב, 2א/2ב, 7א/7ב) each carry half
     weight so the pair together counts as one full question; every other
     question carries a full weight of 1. `recordScore(key, fraction)` is
     called once per screen, at the point that screen's exercise locks in its
     final result -- `fraction` is "how many of this screen's own answers
     ended up correct" (1 for a single-answer screen, correctCount/total for
     a screen with several cells/blanks), captured from whatever state was on
     screen at that moment (including a partial score after attempts run out
     and the correct answer is revealed) -- never re-derived later from a
     post-reveal, all-correct board. */
  var SCORE_WEIGHT = {
    q1: 0.5, q1b: 0.5,
    q2a: 0.5, q2b: 0.5,
    q3: 1,
    q4: 1,
    q5: 1,
    q6: 1,
    q7a: 0.5, q7b: 0.5
  };
  var TOTAL_QUESTIONS = 7; // logical questions (1-7), not screens
  var questionScores = {};

  function recordScore(key, fraction) {
    questionScores[key] = fraction;
  }

  function computeFinalScorePercent() {
    var total = 0;
    Object.keys(SCORE_WEIGHT).forEach(function (key) {
      var fraction = questionScores.hasOwnProperty(key) ? questionScores[key] : 0;
      total += fraction * SCORE_WEIGHT[key];
    });
    return Math.round((total / TOTAL_QUESTIONS) * 100);
  }

  /* ---------- QA dev-harness bridge (index_dev.html) ----------
     Same DEV_READY / DEV_GOTO handshake as the reference course: announces
     the total screen count to the parent frame, then jumps to a 1-based
     screen index on request. Lets index_dev.html step through screens
     without having to play the whole flow each time. */
  var devScreens = Array.prototype.slice.call(document.querySelectorAll(".screen"));

  /* ---------- DEV nav bar (in-page screen jump tool) ----------
     Same prev/number/next control as index_dev.html's outer bar, just
     wired directly to showScreen() instead of talking to an iframe. */
  (function devBar() {
    var totalEl = document.getElementById("dev-total");
    var scrInput = document.getElementById("dev-scr");
    var prevBtn = document.getElementById("dev-prev");
    var nextBtn = document.getElementById("dev-next");
    if (!totalEl || !scrInput || !prevBtn || !nextBtn) {
      return;
    }
    var cur = 1;
    totalEl.textContent = devScreens.length + "  (1…" + devScreens.length + ")";
    scrInput.max = devScreens.length;

    function go(n) {
      n = Math.max(1, Math.min(devScreens.length, n));
      cur = n;
      scrInput.value = n;
      showScreen(devScreens[n - 1].id);
    }
    prevBtn.addEventListener("click", function () { go(cur - 1); });
    nextBtn.addEventListener("click", function () { go(cur + 1); });
    scrInput.addEventListener("change", function () {
      go(parseInt(scrInput.value, 10) || 1);
    });

    /* Keep the number in sync when navigation happens through the course's
       own buttons (Continue/Back, dropdown "next question", etc.) instead of
       this dev bar -- every one of those routes through showScreen() too. */
    syncDevBar = function (id) {
      for (var k = 0; k < devScreens.length; k++) {
        if (devScreens[k].id === id) {
          cur = k + 1;
          scrInput.value = cur;
          break;
        }
      }
    };
  })();

  (function harness() {
    var acked = false;
    function announce() {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "DEV_READY", total: devScreens.length }, "*");
        }
      } catch (e) {}
    }
    window.addEventListener("message", function (e) {
      var d = (e && e.data) || {};
      if (d.type === "DEV_GOTO" && typeof d.screen === "number") {
        acked = true;
        var index = Math.max(1, Math.min(devScreens.length, d.screen)) - 1;
        showScreen(devScreens[index].id);
      } else {
        announce();
      }
    });
    announce();
    window.addEventListener("load", announce);
    var k = 0;
    var iv = setInterval(function () {
      announce();
      if (++k > 20 || acked) {
        clearInterval(iv);
      }
    }, 400);
  })();

  /* ---------- Sorting question (screen-q1) ---------- */

  var ITEMS = {
    basalt: { text: "סלעי בזלת", icon: "assets/סלעי בזלת.png", col: "deplete" },
    phosphate: { text: "מכרה פוספט", icon: "assets/מכרה פוספט.png", col: "deplete" },
    sand: { text: "חול", icon: "assets/חול.png", col: "deplete" },
    oil: { text: "נפט", icon: "assets/נפט.png", col: "deplete" },
    coal: { text: "פחם אבן", icon: "assets/פחם אבן.png", col: "deplete" },
    fish: { text: "דגים", icon: "assets/דגים.png", col: "renew" },
    mangrove: { text: "עצי מנגרובים", icon: "assets/עצי מנגרובים.png", col: "renew" },
    ocean: { text: "מי אוקיינוס", icon: "assets/מי אוקיינוס.png", col: "renew" },
    sun: { text: "אור השמש", icon: "assets/אור שמש.png", col: "renew" },
    wind: { text: "רוחות החוף", icon: "assets/רוחות החורף.png", col: "renew" }
  };
  var ITEM_ORDER = ["basalt", "phosphate", "sand", "oil", "coal", "fish", "mangrove", "ocean", "sun", "wind"];
  var COLUMN_NAME = { deplete: "משאבים מתכלים", renew: "משאבים מתחדשים" };

  var statusEl = document.getElementById("sort-status");
  var trayEl = document.getElementById("item-tray");
  var cells = Array.prototype.slice.call(document.querySelectorAll(".cell"));
  var checkBtn = document.getElementById("btn-check");
  var feedbackPanel = document.getElementById("feedback-panel");
  var feedbackText = document.getElementById("feedback-text");
  var feedbackIcon = feedbackPanel.querySelector(".feedback-icon");
  var continueQ1Btn = document.getElementById("btn-continue-q1");

  var trayOrder = ITEM_ORDER.slice();
  var cellItem = {};
  cells.forEach(function (cell) {
    cellItem[cell.id] = null;
  });

  var picked = null; // { item, from: 'tray' | cellId }
  var MAX_ATTEMPTS = 2;
  var attempts = 0;
  var locked = false;

  function announce(message) {
    statusEl.textContent = "";
    setTimeout(function () {
      statusEl.textContent = message;
    }, 30);
  }

  function emptyCellLabel(cell) {
    var col = cell.getAttribute("data-col");
    var row = Number(cell.getAttribute("data-row")) + 1;
    return "תא ריק, טור " + COLUMN_NAME[col] + ", שורה " + row;
  }

  function clearFeedback() {
    cells.forEach(function (cell) {
      if (cell.disabled) {
        return;
      }
      cell.classList.remove("correct", "wrong");
    });
    feedbackPanel.hidden = true;
  }

  function renderTray() {
    trayEl.innerHTML = "";
    trayOrder.forEach(function (id) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.draggable = true;
      btn.setAttribute("data-item", id);
      btn.setAttribute("aria-pressed", picked && picked.from === "tray" && picked.item === id ? "true" : "false");
      var icon = document.createElement("img");
      icon.className = "pill-icon";
      icon.src = ITEMS[id].icon;
      icon.alt = "";
      icon.draggable = false;
      var text = document.createElement("span");
      text.className = "pill-text";
      text.textContent = ITEMS[id].text;
      btn.appendChild(icon);
      btn.appendChild(text);
      btn.addEventListener("click", function () {
        onTrayPillClick(id);
      });
      btn.addEventListener("dragstart", function (e) {
        if (locked) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "tray:" + id);
        btn.classList.add("dragging");
      });
      btn.addEventListener("dragend", function () {
        btn.classList.remove("dragging");
      });
      li.appendChild(btn);
      trayEl.appendChild(li);
    });
  }

  function renderCell(cell) {
    var id = cellItem[cell.id];
    cell.innerHTML = "";
    if (id) {
      cell.draggable = true;
      cell.setAttribute("data-item", id);
      cell.setAttribute("aria-pressed", picked && picked.from === cell.id ? "true" : "false");
      cell.setAttribute("aria-label", ITEMS[id].text + (picked && picked.from === cell.id ? " — נבחר" : ""));
      var icon = document.createElement("img");
      icon.className = "pill-icon";
      icon.src = ITEMS[id].icon;
      icon.alt = "";
      icon.draggable = false;
      var text = document.createElement("span");
      text.className = "pill-text";
      text.textContent = ITEMS[id].text;
      cell.appendChild(icon);
      cell.appendChild(text);
    } else {
      cell.draggable = false;
      cell.removeAttribute("data-item");
      cell.removeAttribute("aria-pressed");
      cell.setAttribute("aria-label", emptyCellLabel(cell));
    }
  }

  function parseDragSource(dataTransfer) {
    var raw = dataTransfer.getData("text/plain");
    if (raw.indexOf("tray:") === 0) {
      return { item: raw.slice(5), from: "tray" };
    }
    if (raw.indexOf("cell:") === 0) {
      var cellId = raw.slice(5);
      return { item: cellItem[cellId], from: cellId };
    }
    return null;
  }

  function moveSourceToEmptyCell(source, cell) {
    if (source.from === "tray") {
      trayOrder.splice(trayOrder.indexOf(source.item), 1);
    } else {
      cellItem[source.from] = null;
    }
    cellItem[cell.id] = source.item;
  }

  function swapSourceWithCell(source, cell) {
    var otherId = cellItem[cell.id];
    if (source.from === "tray") {
      cellItem[cell.id] = source.item;
      trayOrder.splice(trayOrder.indexOf(source.item), 1);
      trayOrder.push(otherId);
    } else {
      cellItem[source.from] = otherId;
      cellItem[cell.id] = source.item;
    }
    return otherId;
  }

  function renderAll() {
    renderTray();
    cells.forEach(renderCell);
    if (!locked) {
      checkBtn.hidden = trayOrder.length > 0;
    }
  }

  function onTrayPillClick(id) {
    if (locked) {
      return;
    }
    clearFeedback();
    if (!picked) {
      picked = { item: id, from: "tray" };
      announce(ITEMS[id].text + " נבחר. בחרו תא בטבלה כדי להניח אותו שם.");
      renderAll();
      return;
    }
    if (picked.from === "tray" && picked.item === id) {
      picked = null;
      announce("הבחירה בוטלה.");
      renderAll();
      return;
    }
    // Switching selection to a different tray item.
    picked = { item: id, from: "tray" };
    announce(ITEMS[id].text + " נבחר. בחרו תא בטבלה כדי להניח אותו שם.");
    renderAll();
  }

  function onCellClick(cell) {
    if (locked || cell.disabled) {
      return;
    }
    clearFeedback();
    var id = cellItem[cell.id];

    if (!id) {
      // Empty cell.
      if (!picked) {
        return;
      }
      var placedText = ITEMS[picked.item].text;
      moveSourceToEmptyCell(picked, cell);
      picked = null;
      renderAll();
      cell.focus();
      announce(placedText + " הונח ב" + emptyCellLabel(cell).replace("תא ריק, ", ""));
      return;
    }

    // Filled cell.
    if (!picked) {
      picked = { item: id, from: cell.id };
      announce(ITEMS[id].text + " נבחר. בחרו תא אחר או פריט אחר כדי להחליף.");
      renderAll();
      return;
    }
    if (picked.from === cell.id) {
      picked = null;
      announce("הבחירה בוטלה.");
      renderAll();
      return;
    }

    var textA = ITEMS[picked.item].text;
    var otherId = swapSourceWithCell(picked, cell);
    picked = null;
    renderAll();
    cell.focus();
    announce(textA + " ו" + ITEMS[otherId].text + " הוחלפו במקומם.");
  }

  cells.forEach(function (cell) {
    cell.addEventListener("click", function () {
      onCellClick(cell);
    });

    cell.addEventListener("dragstart", function (e) {
      var id = cellItem[cell.id];
      if (!id || locked || cell.disabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "cell:" + cell.id);
      cell.classList.add("dragging");
    });
    cell.addEventListener("dragend", function () {
      cell.classList.remove("dragging");
    });

    cell.addEventListener("dragover", function (e) {
      if (cell.disabled) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    cell.addEventListener("dragenter", function () {
      if (cell.disabled) {
        return;
      }
      cell.classList.add("drag-over");
    });
    cell.addEventListener("dragleave", function () {
      cell.classList.remove("drag-over");
    });
    cell.addEventListener("drop", function (e) {
      e.preventDefault();
      cell.classList.remove("drag-over");
      if (locked || cell.disabled) {
        return;
      }
      var source = parseDragSource(e.dataTransfer);
      if (!source || source.item == null || source.from === cell.id) {
        return;
      }
      clearFeedback();
      picked = null;
      var id = cellItem[cell.id];
      var sourceText = ITEMS[source.item].text;
      if (!id) {
        moveSourceToEmptyCell(source, cell);
        renderAll();
        announce(sourceText + " הונח ב" + emptyCellLabel(cell).replace("תא ריק, ", ""));
      } else {
        var otherId = swapSourceWithCell(source, cell);
        renderAll();
        announce(sourceText + " ו" + ITEMS[otherId].text + " הוחלפו במקומם.");
      }
    });
  });

  trayEl.addEventListener("click", function (e) {
    if (locked || e.target !== trayEl || !picked || picked.from === "tray") {
      return;
    }
    var text = ITEMS[picked.item].text;
    cellItem[picked.from] = null;
    trayOrder.push(picked.item);
    picked = null;
    renderAll();
    announce(text + " הוחזר לרשימת הפריטים.");
  });

  var trayDragDepth = 0;

  trayEl.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  trayEl.addEventListener("dragenter", function () {
    trayDragDepth += 1;
    trayEl.classList.add("drag-over");
  });
  trayEl.addEventListener("dragleave", function () {
    trayDragDepth = Math.max(0, trayDragDepth - 1);
    if (trayDragDepth === 0) {
      trayEl.classList.remove("drag-over");
    }
  });
  trayEl.addEventListener("drop", function (e) {
    e.preventDefault();
    trayDragDepth = 0;
    trayEl.classList.remove("drag-over");
    if (locked) {
      return;
    }
    var source = parseDragSource(e.dataTransfer);
    if (!source || source.from === "tray") {
      return;
    }
    clearFeedback();
    picked = null;
    var text = ITEMS[source.item].text;
    cellItem[source.from] = null;
    trayOrder.push(source.item);
    renderAll();
    announce(text + " הוחזר לרשימת הפריטים.");
  });

  function lockExercise() {
    locked = true;
    checkBtn.disabled = true;
  }

  function revealAnswer() {
    var byCol = { deplete: [], renew: [] };
    ITEM_ORDER.forEach(function (id) {
      byCol[ITEMS[id].col].push(id);
    });

    // Keep cells the learner already got right (and that are locked from a
    // previous correct check); free every other cell so it can be refilled.
    var alreadyCorrect = {};
    cells.forEach(function (cell) {
      var id = cellItem[cell.id];
      var col = cell.getAttribute("data-col");
      if (id && cell.disabled && ITEMS[id].col === col) {
        alreadyCorrect[id] = true;
      } else {
        cellItem[cell.id] = null;
      }
    });

    var remaining = {
      deplete: byCol.deplete.filter(function (id) { return !alreadyCorrect[id]; }),
      renew: byCol.renew.filter(function (id) { return !alreadyCorrect[id]; })
    };

    cells.forEach(function (cell) {
      if (cellItem[cell.id]) {
        return;
      }
      var col = cell.getAttribute("data-col");
      cellItem[cell.id] = remaining[col].shift() || null;
    });

    trayOrder = [];
  }

  renderAll();

  // Safety net: guarantee every drag-over/dragging highlight is cleared once
  // a drag operation ends, however it ended (drop on an invalid target,
  // Escape, dropped outside the window, etc).
  document.addEventListener("dragend", function () {
    trayDragDepth = 0;
    trayEl.classList.remove("drag-over");
    cells.forEach(function (cell) {
      cell.classList.remove("drag-over");
    });
  });

  checkBtn.addEventListener("click", function () {
    if (locked) {
      return;
    }
    if (picked) {
      picked = null;
      renderAll();
    }

    attempts += 1;

    var allCorrect = true;
    cells.forEach(function (cell) {
      var id = cellItem[cell.id];
      var col = cell.getAttribute("data-col");
      var isCorrect = ITEMS[id].col === col;
      cell.classList.toggle("correct", isCorrect);
      cell.classList.toggle("wrong", !isCorrect);
      if (isCorrect) {
        cell.setAttribute("aria-label", ITEMS[id].text + " — במקום הנכון");
        cell.disabled = true;
      } else {
        allCorrect = false;
        var correctCol = COLUMN_NAME[ITEMS[id].col];
        cell.setAttribute("aria-label", ITEMS[id].text + " — במקום שגוי, השייך ל" + correctCol);
      }
    });

    var correctCells = cells.filter(function (cell) {
      return cell.classList.contains("correct");
    });
    var correctCount = correctCells.length;
    var learnerCorrectCellIds = {};
    correctCells.forEach(function (cell) {
      learnerCorrectCellIds[cell.id] = true;
    });

    feedbackPanel.hidden = false;
    feedbackPanel.classList.remove("feedback-panel--reveal");

    if (allCorrect) {
      recordScore("q1", 1);
      lockExercise();
      feedbackIcon.hidden = false;
      feedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      feedbackIcon.classList.remove("feedback-icon--reveal");
      feedbackPanel.classList.remove("feedback-panel--wrong");
      feedbackText.innerHTML = "<strong>כל הכבוד!</strong>מיינתם את משאבי הטבע של הלגונה.";
      announce("כל הכבוד! כל הפריטים במקום הנכון.");
      continueQ1Btn.hidden = false;
      continueQ1Btn.classList.add("nav-pulse");
    } else if (attempts < MAX_ATTEMPTS) {
      feedbackIcon.hidden = false;
      feedbackIcon.src = "assets/smily.png";
      feedbackIcon.classList.remove("feedback-icon--reveal");
      feedbackPanel.classList.add("feedback-panel--wrong");
      feedbackText.innerHTML = "<strong>נסו שנית</strong><b>זכרו!</b> משאב מתכלה נמצא בטבע בכמות מוגבלת ומשאב מתחדש נוצר באופן קבוע ובקצב מהיר.";
      announce("חלק מהפריטים עדיין לא במקום הנכון. נותר לכם עוד נסיון אחד.");
      window.setTimeout(function () {
        if (locked) {
          return;
        }
        feedbackPanel.hidden = true;
        cells.forEach(function (cell) {
          if (!cell.classList.contains("wrong")) {
            return;
          }
          var wrongId = cellItem[cell.id];
          cellItem[cell.id] = null;
          trayOrder.push(wrongId);
          cell.classList.remove("wrong");
        });
        renderAll();
      }, 5000);
    } else {
      recordScore("q1", correctCount / cells.length);
      revealAnswer();
      renderAll();
      cells.forEach(function (cell) {
        var id = cellItem[cell.id];
        cell.classList.remove("wrong");
        if (learnerCorrectCellIds[cell.id]) {
          cell.classList.add("correct");
          cell.setAttribute("aria-label", ITEMS[id].text + " — במקום הנכון");
        } else {
          cell.classList.add("revealed");
          cell.setAttribute("aria-label", ITEMS[id].text + " — התשובה הנכונה מוצגת");
        }
        cell.disabled = true;
      });
      lockExercise();
      feedbackIcon.hidden = false;
      feedbackIcon.src = "assets/reveal v2.png";
      feedbackIcon.classList.remove("feedback-icon--reveal");
      feedbackPanel.classList.add("feedback-panel--reveal");
      feedbackText.innerHTML = "<strong>לא נורא!</strong>כך המיון הנכון נראה. אלה משאבי הטבע של הלגונה.";
      announce("נגמרו הנסיונות. התשובה הנכונה מוצגת כעת בטבלה.");
      continueQ1Btn.hidden = false;
      continueQ1Btn.classList.add("nav-pulse");
    }
  });

  /* ---------- Help dialog ---------- */

  function getFocusable(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function setupHelpDialog(openBtn, closeBtn, overlay, dialog) {
    function onKeydown(e) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab") {
        var focusable = getFocusable(dialog);
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    function open() {
      overlay.hidden = false;
      closeBtn.focus();
      document.addEventListener("keydown", onKeydown);
    }
    function close() {
      overlay.hidden = true;
      document.removeEventListener("keydown", onKeydown);
      openBtn.focus();
    }
    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        close();
      }
    });
  }

  setupHelpDialog(
    document.getElementById("btn-help-open"),
    document.getElementById("btn-help-close"),
    document.getElementById("help-overlay"),
    document.getElementById("help-dialog")
  );

  continueQ1Btn.addEventListener("click", function () {
    continueQ1Btn.classList.remove("nav-pulse");
    showScreen("screen-q1b");
  });

  document.getElementById("btn-back-q1").addEventListener("click", function () {
    showScreen("screen-video-intro");
  });

  /* ---------- Screen 1b: fill-in-the-blank question ---------- */

  var q1bScreen = document.getElementById("screen-q1b");
  var fillSelects = Array.prototype.slice.call(q1bScreen.querySelectorAll(".fill-select"));

  fillSelects.forEach(arrangeFillSelectOptions);

  var q1bCheck = document.getElementById("btn-check-q1b");
  var q1bFeedbackPanel = document.getElementById("feedback-panel-q1b");
  var q1bFeedbackText = document.getElementById("feedback-text-q1b");
  var q1bFeedbackIcon = q1bFeedbackPanel.querySelector(".feedback-icon");
  var continueQ1bBtn = document.getElementById("btn-continue-q1b");
  var Q1B_MAX_ATTEMPTS = 2;
  var q1bAttempts = 0;
  var q1bLocked = false;

  function q1bAllChosen() {
    return fillSelects.every(function (s) { return s.value !== ""; });
  }

  function q1bClearResult() {
    fillSelects.forEach(function (s) {
      if (s.disabled) {
        return;
      }
      s.classList.remove("correct", "wrong");
      clearFillBadge(s);
    });
    q1bFeedbackPanel.hidden = true;
    q1bFeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
  }

  fillSelects.forEach(function (select) {
    select.addEventListener("change", function () {
      if (q1bLocked) {
        return;
      }
      q1bClearResult();
      q1bCheck.hidden = !q1bAllChosen();
    });
  });

  q1bCheck.addEventListener("click", function () {
    if (q1bLocked || !q1bAllChosen()) {
      return;
    }
    q1bAttempts += 1;

    var allCorrect = true;
    fillSelects.forEach(function (select) {
      var ok = select.value === select.getAttribute("data-answer");
      select.classList.toggle("correct", ok);
      select.classList.toggle("wrong", !ok);
      setFillBadge(select, ok);
      if (!ok) {
        allCorrect = false;
      }
    });

    var q1bCorrectCount = fillSelects.filter(function (s) {
      return s.classList.contains("correct");
    }).length;

    q1bFeedbackPanel.hidden = false;

    if (allCorrect) {
      recordScore("q1b", 1);
      q1bLocked = true;
      q1bCheck.hidden = true;
      fillSelects.forEach(function (select) { select.disabled = true; });
      q1bFeedbackIcon.hidden = false;
      q1bFeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q1bFeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
      q1bFeedbackText.innerHTML = "<strong>תשובה נכונה!</strong>התקדמו לשאלה הבאה";
      continueQ1bBtn.hidden = false;
    } else if (q1bAttempts < Q1B_MAX_ATTEMPTS) {
      // Correctly-answered blanks lock in place -- only the still-wrong ones
      // stay open for the second attempt.
      fillSelects.forEach(function (select) {
        if (select.classList.contains("correct")) {
          select.disabled = true;
        }
      });
      q1bFeedbackIcon.hidden = false;
      q1bFeedbackIcon.src = "assets/smily.png";
      q1bFeedbackPanel.classList.add("feedback-panel--wrong");
      q1bFeedbackText.innerHTML = "<strong>נסו שנית</strong>";
      q1bCheck.hidden = false;
    } else {
      recordScore("q1b", q1bCorrectCount / fillSelects.length);
      q1bLocked = true;
      q1bCheck.hidden = true;
      fillSelects.forEach(function (select) {
        var wasCorrect = select.classList.contains("correct");
        select.value = select.getAttribute("data-answer");
        select.classList.remove("wrong");
        select.classList.toggle("correct", wasCorrect);
        select.classList.toggle("revealed", !wasCorrect);
        setFillBadge(select, true, !wasCorrect);
        select.disabled = true;
      });
      q1bFeedbackIcon.hidden = false;
      q1bFeedbackIcon.src = "assets/reveal v2.png";
      q1bFeedbackPanel.classList.add("feedback-panel--reveal");
      q1bFeedbackText.innerHTML = "<strong>לא נורא!</strong>כך משלימים את הקטע נכון.";
      continueQ1bBtn.hidden = false;
    }
  });

  continueQ1bBtn.addEventListener("click", function () {
    showScreen("screen-video-q1q2");
  });

  document.getElementById("btn-back-q1b").addEventListener("click", function () {
    showScreen("screen-q1");
  });

  setupHelpDialog(
    document.getElementById("btn-help-open-q1b"),
    document.getElementById("btn-help-close-q1b"),
    document.getElementById("help-overlay-q1b"),
    document.getElementById("help-dialog-q1b")
  );

  /* ---------- Screen 2a: fish-stock chart fill-in-the-blank ---------- */

  var q2aScreen = document.getElementById("screen-q2a");
  var q2aFillSelects = Array.prototype.slice.call(q2aScreen.querySelectorAll(".fill-select"));

  q2aFillSelects.forEach(arrangeFillSelectOptions);

  var q2aCheck = document.getElementById("btn-check-q2a");
  var q2aFeedbackPanel = document.getElementById("feedback-panel-q2a");
  var q2aFeedbackText = document.getElementById("feedback-text-q2a");
  var q2aFeedbackIcon = q2aFeedbackPanel.querySelector(".feedback-icon");
  var continueQ2aBtn = document.getElementById("btn-continue-q2a");
  var Q2A_MAX_ATTEMPTS = 2;
  var q2aAttempts = 0;
  var q2aLocked = false;

  function q2aAllChosen() {
    return q2aFillSelects.every(function (s) { return s.value !== ""; });
  }

  function q2aClearResult() {
    q2aFillSelects.forEach(function (s) {
      if (s.disabled) {
        return;
      }
      s.classList.remove("correct", "wrong");
      clearFillBadge(s);
    });
    q2aFeedbackPanel.hidden = true;
    q2aFeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
  }

  q2aFillSelects.forEach(function (select) {
    select.addEventListener("change", function () {
      if (q2aLocked) {
        return;
      }
      q2aClearResult();
      q2aCheck.hidden = !q2aAllChosen();
    });
  });

  q2aCheck.addEventListener("click", function () {
    if (q2aLocked || !q2aAllChosen()) {
      return;
    }
    q2aAttempts += 1;

    var allCorrect = true;
    q2aFillSelects.forEach(function (select) {
      var ok = select.value === select.getAttribute("data-answer");
      select.classList.toggle("correct", ok);
      select.classList.toggle("wrong", !ok);
      setFillBadge(select, ok);
      if (!ok) {
        allCorrect = false;
      }
    });

    var q2aCorrectCount = q2aFillSelects.filter(function (s) {
      return s.classList.contains("correct");
    }).length;

    q2aFeedbackPanel.hidden = false;

    if (allCorrect) {
      recordScore("q2a", 1);
      q2aLocked = true;
      q2aCheck.hidden = true;
      q2aFillSelects.forEach(function (select) { select.disabled = true; });
      q2aFeedbackIcon.hidden = false;
      q2aFeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q2aFeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
      q2aFeedbackText.innerHTML = "<strong>תשובה נכונה!</strong>התקדמו לשאלה הבאה";
      continueQ2aBtn.hidden = false;
    } else if (q2aAttempts < Q2A_MAX_ATTEMPTS) {
      // Correctly-answered blanks lock in place -- only the still-wrong ones
      // stay open for the second attempt.
      q2aFillSelects.forEach(function (select) {
        if (select.classList.contains("correct")) {
          select.disabled = true;
        }
      });
      q2aFeedbackIcon.hidden = false;
      q2aFeedbackIcon.src = "assets/smily.png";
      q2aFeedbackPanel.classList.add("feedback-panel--wrong");
      q2aFeedbackText.innerHTML = "<strong>נסו שנית</strong>";
      q2aCheck.hidden = false;
    } else {
      recordScore("q2a", q2aCorrectCount / q2aFillSelects.length);
      q2aLocked = true;
      q2aCheck.hidden = true;
      q2aFillSelects.forEach(function (select) {
        var wasCorrect = select.classList.contains("correct");
        select.value = select.getAttribute("data-answer");
        select.classList.remove("wrong");
        select.classList.toggle("correct", wasCorrect);
        select.classList.toggle("revealed", !wasCorrect);
        setFillBadge(select, true, !wasCorrect);
        select.disabled = true;
      });
      q2aFeedbackIcon.hidden = false;
      q2aFeedbackIcon.src = "assets/reveal v2.png";
      q2aFeedbackPanel.classList.add("feedback-panel--reveal");
      q2aFeedbackText.innerHTML = "<strong>לא נורא!</strong>כך משלימים את המשפטים נכון.";
      continueQ2aBtn.hidden = false;
    }
  });

  continueQ2aBtn.addEventListener("click", function () {
    showScreen("screen-q2b");
  });

  document.getElementById("btn-back-q2a").addEventListener("click", function () {
    showScreen("screen-video-q1q2");
  });

  /* ---------- Screen 2b: single-choice with per-distractor feedback ---------- */

  var q2bOptions = Array.prototype.slice.call(document.querySelectorAll("#q2b-options .q-opt"));
  var q2bCheck = document.getElementById("btn-check-q2b");
  var q2bFeedbackPanel = document.getElementById("feedback-panel-q2b");
  var q2bFeedbackText = document.getElementById("feedback-text-q2b");
  var q2bFeedbackIcon = q2bFeedbackPanel.querySelector(".feedback-icon");
  var continueQ2bBtn = document.getElementById("btn-continue-q2b");
  var Q2B_MAX_ATTEMPTS = 2;
  var q2bAttempts = 0;
  var q2bLocked = false;
  var q2bSelected = null;

  var q2bCorrect = q2bOptions.filter(function (opt) {
    return opt.getAttribute("data-correct") === "true";
  })[0];

  function q2bClearResult() {
    q2bOptions.forEach(function (opt) {
      opt.classList.remove("correct", "wrong");
    });
    q2bFeedbackPanel.hidden = true;
    q2bFeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
  }

  q2bOptions.forEach(function (opt) {
    opt.addEventListener("click", function () {
      if (q2bLocked) {
        return;
      }
      q2bClearResult();
      q2bOptions.forEach(function (o) {
        o.classList.remove("selected");
        o.setAttribute("aria-checked", "false");
      });
      opt.classList.add("selected");
      opt.setAttribute("aria-checked", "true");
      q2bSelected = opt;
      q2bCheck.hidden = false;
    });
  });

  q2bCheck.addEventListener("click", function () {
    if (q2bLocked || !q2bSelected) {
      return;
    }
    q2bAttempts += 1;

    var ok = q2bSelected === q2bCorrect;
    q2bFeedbackPanel.hidden = false;

    if (ok) {
      recordScore("q2b", 1);
      q2bLocked = true;
      q2bCheck.hidden = true;
      q2bSelected.classList.add("correct");
      q2bOptions.forEach(function (o) { o.disabled = true; });
      q2bFeedbackIcon.hidden = false;
      q2bFeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q2bFeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
      q2bFeedbackText.innerHTML = "<strong>מצוין!</strong>" + q2bSelected.getAttribute("data-feedback");
      continueQ2bBtn.hidden = false;
    } else if (q2bAttempts < Q2B_MAX_ATTEMPTS) {
      q2bSelected.classList.add("wrong");
      q2bFeedbackIcon.hidden = false;
      q2bFeedbackIcon.src = "assets/smily.png";
      q2bFeedbackPanel.classList.add("feedback-panel--wrong");
      q2bFeedbackText.textContent = q2bSelected.getAttribute("data-feedback");
      q2bCheck.hidden = false;
    } else {
      recordScore("q2b", 0);
      q2bLocked = true;
      q2bCheck.hidden = true;
      q2bSelected.classList.add("wrong");
      q2bCorrect.classList.add("revealed");
      q2bOptions.forEach(function (o) { o.disabled = true; });
      q2bFeedbackIcon.hidden = false;
      q2bFeedbackIcon.src = "assets/reveal v2.png";
      q2bFeedbackPanel.classList.add("feedback-panel--reveal");
      q2bFeedbackText.textContent = q2bCorrect.getAttribute("data-feedback");
      continueQ2bBtn.hidden = false;
    }
  });

  continueQ2bBtn.addEventListener("click", function () {
    showScreen("screen-q3");
  });

  document.getElementById("btn-back-q2b").addEventListener("click", function () {
    showScreen("screen-q2a");
  });

  /* ---------- Screen 3: cause -> effect matching (drag from tray, like screen-q1) ---------- */

  var Q3_ANSWERS = {
    ocean: { text: "פגיעה במקור המזון של חיות הים ובאיזון הטבעי של החיים בלגונה", row: 0 },
    family: { text: "דאגה יומיומית לאוכל עבור הילדים ולפרנסת הבית", row: 1 },
    village: { text: "התמודדות עם מריבות בין התושבים ועם הקושי לנהל את הכפר", row: 2 }
  };
  var Q3_ITEM_ORDER = ["village", "ocean", "family"];

  var q3Status = document.getElementById("sort-status-q3");
  var q3TrayEl = document.getElementById("q3-tray");
  var q3Cells = Array.prototype.slice.call(document.querySelectorAll(".q3-answer"));
  var q3Check = document.getElementById("btn-check-q3");
  var q3FeedbackPanel = document.getElementById("feedback-panel-q3");
  var q3FeedbackText = document.getElementById("feedback-text-q3");
  var q3FeedbackIcon = q3FeedbackPanel.querySelector(".feedback-icon");
  var continueQ3Btn = document.getElementById("btn-continue-q3");

  var q3TrayOrder = Q3_ITEM_ORDER.slice();
  var q3CellItem = {};
  q3Cells.forEach(function (cell) {
    q3CellItem[cell.id] = null;
  });

  var q3Picked = null; // { item, from: 'tray' | cellId }
  var Q3_MAX_ATTEMPTS = 2;
  var q3Attempts = 0;
  var q3Locked = false;

  function q3Announce(message) {
    q3Status.textContent = "";
    setTimeout(function () {
      q3Status.textContent = message;
    }, 30);
  }

  function q3EmptyCellLabel(cell) {
    var row = Number(cell.getAttribute("data-row")) + 1;
    return "תא ריק, שורה " + row;
  }

  function q3ClearFeedback() {
    q3Cells.forEach(function (cell) {
      if (cell.disabled) {
        return;
      }
      cell.classList.remove("correct", "wrong");
    });
    q3FeedbackPanel.hidden = true;
  }

  function q3RenderTray() {
    q3TrayEl.innerHTML = "";
    q3TrayOrder.forEach(function (id) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.draggable = true;
      btn.setAttribute("data-item", id);
      btn.setAttribute("aria-pressed", q3Picked && q3Picked.from === "tray" && q3Picked.item === id ? "true" : "false");
      var text = document.createElement("span");
      text.className = "pill-text";
      text.textContent = Q3_ANSWERS[id].text;
      btn.appendChild(text);
      btn.addEventListener("click", function () {
        q3OnTrayPillClick(id);
      });
      btn.addEventListener("dragstart", function (e) {
        if (q3Locked) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "tray:" + id);
        btn.classList.add("dragging");
      });
      btn.addEventListener("dragend", function () {
        btn.classList.remove("dragging");
      });
      li.appendChild(btn);
      q3TrayEl.appendChild(li);
    });
  }

  function q3RenderCell(cell) {
    var id = q3CellItem[cell.id];
    cell.innerHTML = "";
    if (id) {
      cell.draggable = true;
      cell.setAttribute("data-item", id);
      cell.setAttribute("aria-pressed", q3Picked && q3Picked.from === cell.id ? "true" : "false");
      cell.setAttribute("aria-label", Q3_ANSWERS[id].text + (q3Picked && q3Picked.from === cell.id ? " — נבחר" : ""));
      var text = document.createElement("span");
      text.textContent = Q3_ANSWERS[id].text;
      cell.appendChild(text);
    } else {
      cell.draggable = false;
      cell.removeAttribute("data-item");
      cell.removeAttribute("aria-pressed");
      cell.setAttribute("aria-label", q3EmptyCellLabel(cell));
    }
  }

  function q3ParseDragSource(dataTransfer) {
    var raw = dataTransfer.getData("text/plain");
    if (raw.indexOf("tray:") === 0) {
      return { item: raw.slice(5), from: "tray" };
    }
    if (raw.indexOf("cell:") === 0) {
      var cellId = raw.slice(5);
      return { item: q3CellItem[cellId], from: cellId };
    }
    return null;
  }

  function q3MoveSourceToEmptyCell(source, cell) {
    if (source.from === "tray") {
      q3TrayOrder.splice(q3TrayOrder.indexOf(source.item), 1);
    } else {
      q3CellItem[source.from] = null;
    }
    q3CellItem[cell.id] = source.item;
  }

  function q3SwapSourceWithCell(source, cell) {
    var otherId = q3CellItem[cell.id];
    if (source.from === "tray") {
      q3CellItem[cell.id] = source.item;
      q3TrayOrder.splice(q3TrayOrder.indexOf(source.item), 1);
      q3TrayOrder.push(otherId);
    } else {
      q3CellItem[source.from] = otherId;
      q3CellItem[cell.id] = source.item;
    }
    return otherId;
  }

  function q3RenderAll() {
    q3RenderTray();
    q3Cells.forEach(q3RenderCell);
    if (!q3Locked) {
      q3Check.hidden = q3TrayOrder.length > 0;
    }
  }

  function q3OnTrayPillClick(id) {
    if (q3Locked) {
      return;
    }
    q3ClearFeedback();
    if (!q3Picked) {
      q3Picked = { item: id, from: "tray" };
      q3Announce(Q3_ANSWERS[id].text + " נבחר. בחרו תא בטבלה כדי להניח אותו שם.");
      q3RenderAll();
      return;
    }
    if (q3Picked.from === "tray" && q3Picked.item === id) {
      q3Picked = null;
      q3Announce("הבחירה בוטלה.");
      q3RenderAll();
      return;
    }
    q3Picked = { item: id, from: "tray" };
    q3Announce(Q3_ANSWERS[id].text + " נבחר. בחרו תא בטבלה כדי להניח אותו שם.");
    q3RenderAll();
  }

  function q3OnCellClick(cell) {
    if (q3Locked || cell.disabled) {
      return;
    }
    q3ClearFeedback();
    var id = q3CellItem[cell.id];

    if (!id) {
      if (!q3Picked) {
        return;
      }
      var placedText = Q3_ANSWERS[q3Picked.item].text;
      q3MoveSourceToEmptyCell(q3Picked, cell);
      q3Picked = null;
      q3RenderAll();
      cell.focus();
      q3Announce(placedText + " הונח ב" + q3EmptyCellLabel(cell).replace("תא ריק, ", ""));
      return;
    }

    if (!q3Picked) {
      q3Picked = { item: id, from: cell.id };
      q3Announce(Q3_ANSWERS[id].text + " נבחר. בחרו תא אחר או פריט אחר כדי להחליף.");
      q3RenderAll();
      return;
    }
    if (q3Picked.from === cell.id) {
      q3Picked = null;
      q3Announce("הבחירה בוטלה.");
      q3RenderAll();
      return;
    }

    var textA = Q3_ANSWERS[q3Picked.item].text;
    var otherId = q3SwapSourceWithCell(q3Picked, cell);
    q3Picked = null;
    q3RenderAll();
    cell.focus();
    q3Announce(textA + " ו" + Q3_ANSWERS[otherId].text + " הוחלפו במקומם.");
  }

  q3Cells.forEach(function (cell) {
    cell.addEventListener("click", function () {
      q3OnCellClick(cell);
    });

    cell.addEventListener("dragstart", function (e) {
      var id = q3CellItem[cell.id];
      if (!id || q3Locked || cell.disabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "cell:" + cell.id);
      cell.classList.add("dragging");
    });
    cell.addEventListener("dragend", function () {
      cell.classList.remove("dragging");
    });

    cell.addEventListener("dragover", function (e) {
      if (cell.disabled) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    cell.addEventListener("dragenter", function () {
      if (cell.disabled) {
        return;
      }
      cell.classList.add("drag-over");
    });
    cell.addEventListener("dragleave", function () {
      cell.classList.remove("drag-over");
    });
    cell.addEventListener("drop", function (e) {
      e.preventDefault();
      cell.classList.remove("drag-over");
      if (q3Locked || cell.disabled) {
        return;
      }
      var source = q3ParseDragSource(e.dataTransfer);
      if (!source || source.item == null || source.from === cell.id) {
        return;
      }
      q3ClearFeedback();
      q3Picked = null;
      var id = q3CellItem[cell.id];
      var sourceText = Q3_ANSWERS[source.item].text;
      if (!id) {
        q3MoveSourceToEmptyCell(source, cell);
        q3RenderAll();
        q3Announce(sourceText + " הונח ב" + q3EmptyCellLabel(cell).replace("תא ריק, ", ""));
      } else {
        var otherId = q3SwapSourceWithCell(source, cell);
        q3RenderAll();
        q3Announce(sourceText + " ו" + Q3_ANSWERS[otherId].text + " הוחלפו במקומם.");
      }
    });
  });

  q3TrayEl.addEventListener("click", function (e) {
    if (q3Locked || e.target !== q3TrayEl || !q3Picked || q3Picked.from === "tray") {
      return;
    }
    var text = Q3_ANSWERS[q3Picked.item].text;
    q3CellItem[q3Picked.from] = null;
    q3TrayOrder.push(q3Picked.item);
    q3Picked = null;
    q3RenderAll();
    q3Announce(text + " הוחזר לרשימת הפריטים.");
  });

  var q3TrayDragDepth = 0;

  q3TrayEl.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  q3TrayEl.addEventListener("dragenter", function () {
    q3TrayDragDepth += 1;
    q3TrayEl.classList.add("drag-over");
  });
  q3TrayEl.addEventListener("dragleave", function () {
    q3TrayDragDepth = Math.max(0, q3TrayDragDepth - 1);
    if (q3TrayDragDepth === 0) {
      q3TrayEl.classList.remove("drag-over");
    }
  });
  q3TrayEl.addEventListener("drop", function (e) {
    e.preventDefault();
    q3TrayDragDepth = 0;
    q3TrayEl.classList.remove("drag-over");
    if (q3Locked) {
      return;
    }
    var source = q3ParseDragSource(e.dataTransfer);
    if (!source || source.from === "tray") {
      return;
    }
    q3ClearFeedback();
    q3Picked = null;
    var text = Q3_ANSWERS[source.item].text;
    q3CellItem[source.from] = null;
    q3TrayOrder.push(source.item);
    q3RenderAll();
    q3Announce(text + " הוחזר לרשימת הפריטים.");
  });

  document.addEventListener("dragend", function () {
    q3TrayDragDepth = 0;
    q3TrayEl.classList.remove("drag-over");
    q3Cells.forEach(function (cell) {
      cell.classList.remove("drag-over");
    });
  });

  q3RenderAll();

  q3Check.addEventListener("click", function () {
    if (q3Locked) {
      return;
    }
    if (q3Picked) {
      q3Picked = null;
      q3RenderAll();
    }

    q3Attempts += 1;

    var allCorrect = true;
    q3Cells.forEach(function (cell) {
      var id = q3CellItem[cell.id];
      var row = Number(cell.getAttribute("data-row"));
      var isCorrect = Q3_ANSWERS[id].row === row;
      cell.classList.toggle("correct", isCorrect);
      cell.classList.toggle("wrong", !isCorrect);
      if (isCorrect) {
        cell.setAttribute("aria-label", Q3_ANSWERS[id].text + " — בשורה הנכונה");
        cell.disabled = true;
      } else {
        allCorrect = false;
        cell.setAttribute("aria-label", Q3_ANSWERS[id].text + " — בשורה שגויה");
      }
    });

    var q3CorrectCells = q3Cells.filter(function (cell) {
      return cell.classList.contains("correct");
    });
    var q3CorrectCount = q3CorrectCells.length;
    var q3LearnerCorrectCellIds = {};
    q3CorrectCells.forEach(function (cell) {
      q3LearnerCorrectCellIds[cell.id] = true;
    });

    q3FeedbackPanel.hidden = false;
    q3FeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");

    if (allCorrect) {
      recordScore("q3", 1);
      q3Locked = true;
      q3Check.hidden = true;
      q3FeedbackIcon.hidden = false;
      q3FeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q3FeedbackText.innerHTML = "<strong>תשובה נכונה!</strong>התקדמו לשאלה הבאה";
      q3Announce("כל הכבוד! כל הנזקים משוייכים לשורה הנכונה.");
      continueQ3Btn.hidden = false;
    } else if (q3Attempts < Q3_MAX_ATTEMPTS) {
      q3FeedbackIcon.hidden = false;
      q3FeedbackIcon.src = "assets/smily.png";
      q3FeedbackPanel.classList.add("feedback-panel--wrong");
      q3FeedbackText.innerHTML = "<strong>נסו שנית</strong>";
      q3Announce("חלק מהנזקים עדיין לא בשורה הנכונה. נותר לכם עוד נסיון אחד.");
      window.setTimeout(function () {
        if (q3Locked) {
          return;
        }
        q3FeedbackPanel.hidden = true;
        q3Cells.forEach(function (cell) {
          if (!cell.classList.contains("wrong")) {
            return;
          }
          var wrongId = q3CellItem[cell.id];
          q3CellItem[cell.id] = null;
          q3TrayOrder.push(wrongId);
          cell.classList.remove("wrong");
        });
        q3RenderAll();
      }, 5000);
    } else {
      recordScore("q3", q3CorrectCount / q3Cells.length);
      var byRow = {};
      Object.keys(Q3_ANSWERS).forEach(function (id) {
        byRow[Q3_ANSWERS[id].row] = id;
      });
      q3Cells.forEach(function (cell) {
        var row = Number(cell.getAttribute("data-row"));
        q3CellItem[cell.id] = byRow[row];
      });
      q3TrayOrder = [];
      q3RenderAll();
      q3Cells.forEach(function (cell) {
        var id = q3CellItem[cell.id];
        cell.classList.remove("wrong");
        if (q3LearnerCorrectCellIds[cell.id]) {
          cell.classList.add("correct");
          cell.setAttribute("aria-label", Q3_ANSWERS[id].text + " — בשורה הנכונה");
        } else {
          cell.classList.add("revealed");
          cell.setAttribute("aria-label", Q3_ANSWERS[id].text + " — התשובה הנכונה מוצגת");
        }
        cell.disabled = true;
      });
      q3Locked = true;
      q3Check.hidden = true;
      q3FeedbackIcon.hidden = false;
      q3FeedbackIcon.src = "assets/reveal v2.png";
      q3FeedbackPanel.classList.add("feedback-panel--reveal");
      q3FeedbackText.innerHTML = "<strong>לא נורא!</strong>כך השיוך הנכון נראה.";
      q3Announce("נגמרו הנסיונות. השיוך הנכון מוצג כעת בטבלה.");
      continueQ3Btn.hidden = false;
    }
  });

  continueQ3Btn.addEventListener("click", function () {
    showScreen("screen-q4");
  });

  document.getElementById("btn-back-q3").addEventListener("click", function () {
    showScreen("screen-q2b");
  });

  /* ---------- Screen 4: fact vs. opinion sort ---------- */

  var Q4_ITEMS = [
    { id: "waves", text: "הים כועס על התושבים בכפר ולכן הוא מעלים את הדגים", col: "feelings" },
    { id: "neighbors", text: "הדייגים מהאי השכן תמיד דגים את הדגים הכי טעימים ומשאירים לנו רק לכלוך", col: "feelings" },
    { id: "scared", text: "כנראה הדגים נבהלו מרעש המנועים ועברו לים הפתוח", col: "feelings" },
    { id: "tradition", text: "דיג ברשתות צפופות הוא הדרך הכי מהנה לדוג, ואין צורך לשנות אותה", col: "feelings" },
    { id: "catch-half", text: "השנה הצלחנו לדוג חצי מכמות הדגים שדגנו לפני שנתיים", col: "facts" },
    { id: "net-size", text: "בדיקת הרשתות באמצעות סרגל מראה שגודל החורים ברשת הם 1.5 ס\"מ", col: "facts" },
    { id: "boats", text: "רישומי המועצה מראים שמספר סירות הדיג בכפר גדל מ-5 ל-25 סירות", col: "facts" },
    { id: "area", text: "הדיג מתבצע בכל השטח שסביב לכפר, גם במקומות בהם דגים צעירים נוטים להסתתר", col: "facts" },
    { id: "young-fish", text: "דגים צעירים וקטנים שנתפסים ברשת, אינם מספיקים לגדול ולהתפתח ולהעמיד דור חדש של דגים", col: "facts" }
  ];
  var Q4_BY_ID = {};
  Q4_ITEMS.forEach(function (item) { Q4_BY_ID[item.id] = item; });
  var Q4_MAX_ATTEMPTS = 2;

  var q4Status = document.getElementById("sort-status-q4");
  var q4Current = document.getElementById("q4-current");
  var q4CurrentItem = document.getElementById("q4-current-item");
  var q4Cols = { feelings: document.getElementById("q4-col-feelings"), facts: document.getElementById("q4-col-facts") };
  var q4ColBoxes = Array.prototype.slice.call(document.querySelectorAll(".q4-col"));
  var q4ColBox = {};
  q4ColBoxes.forEach(function (box) { q4ColBox[box.getAttribute("data-col")] = box; });
  var q4Check = document.getElementById("btn-check-q4");
  var q4FeedbackPanel = document.getElementById("feedback-panel-q4");
  var q4FeedbackText = document.getElementById("feedback-text-q4");
  var q4FeedbackIcon = q4FeedbackPanel.querySelector(".feedback-icon");
  var continueQ4Btn = document.getElementById("btn-continue-q4");

  function q4Shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  var q4Queue = q4Shuffle(Q4_ITEMS.map(function (item) { return item.id; }));
  var q4Placed = { feelings: [], facts: [] };
  var q4Attempts = 0;
  var q4Locked = false;
  /* Items confirmed correct on a check stay locked in place (green, not
     draggable/clickable) even on a later attempt -- only the still-wrong
     ones remain open to fix. */
  var q4LockedItems = {};

  function q4Announce(message) {
    q4Status.textContent = "";
    window.setTimeout(function () { q4Status.textContent = message; }, 30);
  }

  function q4ClearFeedback() {
    Object.keys(q4Placed).forEach(function (col) {
      q4Cols[col].querySelectorAll(".q4-blob").forEach(function (blob) {
        var id = blob.getAttribute("data-item");
        if (q4LockedItems[id]) {
          return;
        }
        blob.classList.remove("correct", "wrong");
        var icon = blob.querySelector(".q4-blob-radio");
        if (icon) {
          icon.hidden = true;
        }
      });
    });
    q4FeedbackPanel.hidden = true;
  }

  function q4SetBlobIcon(blob) {
    var icon = blob.querySelector(".q4-blob-radio");
    if (icon) {
      icon.hidden = false;
    }
  }

  function q4PlaceFeedbackPanel() {
    var col = q4Placed.feelings.length <= q4Placed.facts.length ? "feelings" : "facts";
    q4ColBox[col].appendChild(q4FeedbackPanel);
  }

  function q4MarkColumn(col) {
    q4Cols[col].querySelectorAll(".q4-blob").forEach(function (blob) {
      var id = blob.getAttribute("data-item");
      var isCorrect = Q4_BY_ID[id].col === col;
      blob.classList.toggle("correct", isCorrect);
      blob.classList.toggle("wrong", !isCorrect);
      q4SetBlobIcon(blob);
    });
  }

  function q4RenderCurrent() {
    if (q4Queue.length === 0) {
      q4Current.hidden = true;
      return;
    }
    q4Current.hidden = false;
    var item = Q4_BY_ID[q4Queue[0]];
    q4CurrentItem.textContent = item.text;
  }

  function q4RenderColumn(col) {
    var list = q4Cols[col];
    list.innerHTML = "";
    q4Placed[col].forEach(function (id) {
      var item = Q4_BY_ID[id];
      var li = document.createElement("li");
      var blob = document.createElement("button");
      blob.type = "button";
      blob.className = "q4-blob";
      blob.setAttribute("data-item", id);

      var icon = document.createElement("span");
      icon.className = "q4-blob-radio";
      icon.setAttribute("aria-hidden", "true");
      blob.appendChild(icon);

      var text = document.createElement("span");
      text.className = "q4-blob-text";
      text.textContent = item.text;
      blob.appendChild(text);

      var itemLocked = q4Locked || q4LockedItems[id];
      if (itemLocked) {
        icon.hidden = false;
        blob.classList.add("correct");
        blob.disabled = true;
      } else {
        icon.hidden = true;
        blob.draggable = true;
        blob.addEventListener("click", function () { q4ReturnToQueue(id, col); });
        blob.addEventListener("dragstart", function (e) {
          e.dataTransfer.setData("text/plain", "q4-placed:" + col + ":" + id);
          e.dataTransfer.effectAllowed = "move";
          blob.classList.add("dragging");
        });
        blob.addEventListener("dragend", function () {
          blob.classList.remove("dragging");
        });
      }
      li.appendChild(blob);
      list.appendChild(li);
    });
  }

  function q4RenderAll() {
    q4RenderCurrent();
    q4RenderColumn("feelings");
    q4RenderColumn("facts");
    if (!q4Locked) {
      q4Check.hidden = q4Queue.length > 0;
    }
  }

  function q4PlaceCurrent(col) {
    if (q4Locked || q4Queue.length === 0) {
      return;
    }
    var id = q4Queue.shift();
    q4Placed[col].push(id);
    q4ClearFeedback();
    q4RenderAll();
    q4Announce(Q4_BY_ID[id].text + " הונח בעמודת " + (col === "facts" ? "עובדות מדידות" : "דעות או הרגשות") + ".");
  }

  function q4ReturnToQueue(id, col) {
    if (q4Locked || q4LockedItems[id]) {
      return;
    }
    q4Placed[col].splice(q4Placed[col].indexOf(id), 1);
    q4Queue.unshift(id);
    q4ClearFeedback();
    q4RenderAll();
    q4Announce(Q4_BY_ID[id].text + " הוחזר לבחירה.");
  }

  function q4MoveToColumn(id, fromCol, toCol) {
    if (q4Locked || q4LockedItems[id] || fromCol === toCol) {
      return;
    }
    q4Placed[fromCol].splice(q4Placed[fromCol].indexOf(id), 1);
    q4Placed[toCol].push(id);
    q4ClearFeedback();
    q4RenderAll();
    q4Announce(Q4_BY_ID[id].text + " הועבר לעמודת " + (toCol === "facts" ? "עובדות מדידות" : "דעות או הרגשות") + ".");
  }

  q4CurrentItem.addEventListener("dragstart", function (e) {
    e.dataTransfer.setData("text/plain", "q4-current");
    e.dataTransfer.effectAllowed = "move";
    q4CurrentItem.classList.add("dragging");
  });
  q4CurrentItem.addEventListener("dragend", function () {
    q4CurrentItem.classList.remove("dragging");
  });

  q4ColBoxes.forEach(function (box) {
    var col = box.getAttribute("data-col");
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.classList.contains("q4-col-list") || e.target.classList.contains("q4-col-head")) {
        q4PlaceCurrent(col);
      }
    });
    box.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    box.addEventListener("dragenter", function () {
      box.classList.add("drag-over");
    });
    box.addEventListener("dragleave", function (e) {
      if (!box.contains(e.relatedTarget)) {
        box.classList.remove("drag-over");
      }
    });
    box.addEventListener("drop", function (e) {
      e.preventDefault();
      box.classList.remove("drag-over");
      var data = e.dataTransfer.getData("text/plain");
      if (data === "q4-current") {
        q4PlaceCurrent(col);
      } else if (data.indexOf("q4-placed:") === 0) {
        var parts = data.split(":");
        q4MoveToColumn(parts[2], parts[1], col);
      }
    });
  });

  q4RenderAll();

  q4Check.addEventListener("click", function () {
    if (q4Locked) {
      return;
    }
    q4Attempts += 1;

    var allCorrect = true;
    var q4CorrectCount = 0;
    var q4TotalCount = 0;
    var q4LearnerCorrectItemIds = {};
    Object.keys(q4Placed).forEach(function (col) {
      q4Placed[col].forEach(function (id) {
        var isCorrect = Q4_BY_ID[id].col === col;
        q4TotalCount += 1;
        if (isCorrect) {
          q4CorrectCount += 1;
          q4LearnerCorrectItemIds[id] = true;
        } else {
          allCorrect = false;
        }
      });
    });
    q4MarkColumn("feelings");
    q4MarkColumn("facts");

    q4PlaceFeedbackPanel();
    q4FeedbackPanel.hidden = false;
    q4FeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");

    if (allCorrect) {
      recordScore("q4", 1);
      q4Locked = true;
      q4Check.hidden = true;
      q4FeedbackIcon.hidden = false;
      q4FeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q4FeedbackText.innerHTML = "<strong>תשובה נכונה!</strong>התקדמו לשאלה הבאה";
      q4Announce("כל הכבוד! כל ההיגדים משוייכים לעמודה הנכונה.");
      continueQ4Btn.hidden = false;
      document.querySelectorAll(".q4-col .q4-blob").forEach(function (blob) {
        blob.disabled = true;
      });
      /* Leave the marked blobs in place -- no re-render here, since rebuilding
         the column lists would wipe the correct/wrong classes we just set
         before the browser ever paints them. */
    } else if (q4Attempts < Q4_MAX_ATTEMPTS) {
      q4FeedbackIcon.hidden = false;
      q4FeedbackIcon.src = "assets/smily.png";
      q4FeedbackPanel.classList.add("feedback-panel--wrong");
      q4FeedbackText.innerHTML = "<strong>נסו שנית</strong>";
      q4Announce("חלק מההיגדים עדיין לא בעמודה הנכונה. נותר לכם עוד נסיון אחד.");
      /* Items already in their correct column lock in place (green, not
         draggable/clickable) -- only the still-wrong ones stay open to fix. */
      Object.keys(q4Placed).forEach(function (col) {
        q4Placed[col].forEach(function (id) {
          if (Q4_BY_ID[id].col !== col) {
            return;
          }
          q4LockedItems[id] = true;
          var blob = q4Cols[col].querySelector('.q4-blob[data-item="' + id + '"]');
          if (blob) {
            blob.disabled = true;
            blob.draggable = false;
          }
        });
      });
      window.setTimeout(function () {
        if (q4Locked) {
          return;
        }
        q4FeedbackPanel.hidden = true;
        Object.keys(q4Placed).forEach(function (col) {
          var stillWrong = q4Placed[col].filter(function (id) { return Q4_BY_ID[id].col !== col; });
          stillWrong.forEach(function (id) {
            q4Placed[col].splice(q4Placed[col].indexOf(id), 1);
            q4Queue.push(id);
          });
        });
        q4RenderAll();
      }, 5000);
    } else {
      recordScore("q4", q4CorrectCount / q4TotalCount);
      q4Locked = true;
      q4Placed = { feelings: [], facts: [] };
      Q4_ITEMS.forEach(function (item) { q4Placed[item.col].push(item.id); });
      q4Queue = [];
      q4RenderAll();
      q4PlaceFeedbackPanel();
      document.querySelectorAll(".q4-col .q4-blob").forEach(function (blob) {
        var id = blob.getAttribute("data-item");
        var wasCorrect = !!q4LearnerCorrectItemIds[id];
        blob.classList.toggle("correct", wasCorrect);
        blob.classList.toggle("revealed", !wasCorrect);
        q4SetBlobIcon(blob);
      });
      q4Check.hidden = true;
      q4FeedbackIcon.hidden = false;
      q4FeedbackIcon.src = "assets/reveal v2.png";
      q4FeedbackPanel.classList.add("feedback-panel--reveal");
      q4FeedbackText.innerHTML = "<strong>לא נורא!</strong>כך המיון הנכון נראה.";
      q4Announce("נגמרו הנסיונות. המיון הנכון מוצג כעת.");
      continueQ4Btn.hidden = false;
    }
  });

  continueQ4Btn.addEventListener("click", function () {
    showScreen("screen-video1");
  });

  document.getElementById("btn-back-q4").addEventListener("click", function () {
    showScreen("screen-q3");
  });

  /* ---------- Video placeholder screens ----------
     Custom control bar (no native `controls`) + big center play button +
     optional synced captions read from that screen's .vcap-src markup.
     Forward nav stays disabled until the clip finishes playing. */
  function initVideoScreen(screen, continueBtnId) {
    var v = screen.querySelector(".video-el");
    if (!v) {
      return;
    }
    var playBtn = screen.querySelector(".video-play");
    var cap = screen.querySelector("[data-vcap]");
    var continueBtn = document.getElementById(continueBtnId);

    var capSrc = screen.querySelector(".vcap-src");
    var CAPS = capSrc
      ? Array.prototype.map.call(capSrc.querySelectorAll("[data-t]"), function (n) {
          return { t: parseFloat(n.getAttribute("data-t")), text: n.textContent };
        })
      : [];
    var CLEAR_AFTER = capSrc && capSrc.getAttribute("data-end") ? parseFloat(capSrc.getAttribute("data-end")) : 1e9;

    var ccBtn = screen.querySelector("[data-cc]");
    var ppBtn = screen.querySelector("[data-play]");
    var seek = screen.querySelector("[data-seek]");
    var curEl = screen.querySelector("[data-cur]");
    var durEl = screen.querySelector("[data-dur]");
    var muteBtn = screen.querySelector("[data-mute]");
    var volEl = screen.querySelector("[data-vol]");
    var fullBtn = screen.querySelector("[data-full]");
    var vctrls = screen.querySelector(".vctrls");
    var raf = null;
    var seeking = false;
    var PLAY = "▶";
    var PAUSE = "❚❚";
    var idleTimer = null;

    /* Auto-fade the control bar during playback after 2s of no pointer
       movement (never while paused/ended, and never while a keyboard user
       has tabbed to a control inside it -- a plain mouse click also leaves
       that control focused, so this only checks :focus-visible, not focus,
       or a click on the in-bar play/pause button would pin the bar open
       forever on every replay). */
    function showControls() {
      if (vctrls) {
        vctrls.classList.remove("vctrls-idle");
      }
    }
    function scheduleIdle() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (!vctrls || v.paused || v.ended) {
        return;
      }
      idleTimer = setTimeout(function () {
        if (v.paused || v.ended) {
          return;
        }
        var active = document.activeElement;
        if (active && vctrls.contains(active) && active.matches && active.matches(":focus-visible")) {
          return;
        }
        vctrls.classList.add("vctrls-idle");
      }, 2000);
    }
    screen.addEventListener("mousemove", function () {
      showControls();
      scheduleIdle();
    });

    function fmt(s) {
      s = Math.max(0, Math.floor(s || 0));
      return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
    }
    function setCap(t) {
      var s = "";
      for (var i = 0; i < CAPS.length; i++) {
        if (t >= CAPS[i].t) {
          s = CAPS[i].text;
        }
      }
      if (t >= CLEAR_AFTER) {
        s = "";
      }
      if (cap && cap.textContent !== s) {
        cap.textContent = s;
      }
    }
    function syncBar() {
      if (curEl) {
        curEl.textContent = fmt(v.currentTime);
      }
      if (!seeking && seek && v.duration) {
        seek.value = String(Math.round((v.currentTime / v.duration) * 1000));
      }
    }
    function tick() {
      setCap(v.currentTime);
      syncBar();
      if (!v.paused && !v.ended && !screen.hidden) {
        raf = requestAnimationFrame(tick);
      }
    }
    function play() {
      var p = v.play();
      if (p && p.catch) {
        p.catch(function () {});
      }
    }
    function start() {
      if (playBtn) {
        playBtn.classList.add("hidden");
      }
      if (vctrls) {
        vctrls.classList.remove("hidden");
      }
      play();
    }

    if (playBtn) {
      playBtn.addEventListener("click", start);
    }
    if (ppBtn) {
      ppBtn.addEventListener("click", function () {
        if (v.paused) {
          play();
        } else {
          v.pause();
        }
      });
    }
    if (ccBtn) {
      ccBtn.addEventListener("click", function () {
        var on = ccBtn.getAttribute("aria-pressed") !== "true";
        ccBtn.setAttribute("aria-pressed", on ? "true" : "false");
        ccBtn.classList.toggle("is-off", !on);
        if (cap) {
          cap.classList.toggle("cc-hidden", !on);
        }
      });
    }
    if (seek) {
      seek.addEventListener("input", function () {
        seeking = true;
        if (v.duration) {
          v.currentTime = (seek.value / 1000) * v.duration;
          setCap(v.currentTime);
          if (curEl) {
            curEl.textContent = fmt(v.currentTime);
          }
        }
      });
      seek.addEventListener("change", function () {
        seeking = false;
      });
    }
    if (volEl) {
      volEl.addEventListener("input", function () {
        v.volume = volEl.value / 100;
        v.muted = v.volume === 0;
        if (muteBtn) {
          muteBtn.textContent = v.muted ? "🔇" : "🔊";
        }
      });
    }
    if (muteBtn) {
      muteBtn.addEventListener("click", function () {
        v.muted = !v.muted;
        muteBtn.textContent = v.muted ? "🔇" : "🔊";
        if (volEl) {
          volEl.value = v.muted ? 0 : Math.round(v.volume * 100);
        }
      });
    }
    if (fullBtn) {
      fullBtn.addEventListener("click", function () {
        var el = screen.querySelector(".videoscreen") || v;
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (el.requestFullscreen) {
          el.requestFullscreen();
        }
      });
    }

    v.addEventListener("loadedmetadata", function () {
      if (durEl) {
        durEl.textContent = fmt(v.duration);
      }
    });
    v.addEventListener("play", function () {
      if (ppBtn) {
        ppBtn.textContent = PAUSE;
      }
      if (raf) {
        cancelAnimationFrame(raf);
      }
      raf = requestAnimationFrame(tick);
      scheduleIdle();
    });
    v.addEventListener("pause", function () {
      if (ppBtn) {
        ppBtn.textContent = PLAY;
      }
      showControls();
      scheduleIdle();
    });
    v.addEventListener("ended", function () {
      showControls();
      scheduleIdle();
      if (ppBtn) {
        ppBtn.textContent = PLAY;
      }
      setCap(1e9);
      if (continueBtn) {
        continueBtn.disabled = false;
      }
    });
    v.addEventListener("seeked", function () {
      setCap(v.currentTime);
    });
  }

  initVideoScreen(document.getElementById("screen-video1"), "btn-continue-video1");

  document.getElementById("btn-continue-video1").addEventListener("click", function () {
    showScreen("screen-q5");
  });
  document.getElementById("btn-back-video1").addEventListener("click", function () {
    showScreen("screen-q4");
  });

  /* ---------- Video placeholder between Q1ב and Q2א ---------- */
  initVideoScreen(document.getElementById("screen-video-q1q2"), "btn-continue-video-q1q2");

  document.getElementById("btn-continue-video-q1q2").addEventListener("click", function () {
    showScreen("screen-q2a");
  });
  document.getElementById("btn-back-video-q1q2").addEventListener("click", function () {
    showScreen("screen-q1b");
  });

  /* ---------- Opening screen + intro video placeholder ----------
     screen-opening -> screen-video-intro -> screen-q1. Same initVideoScreen()
     pattern as video1/video3. */
  document.getElementById("btn-continue-opening").addEventListener("click", function () {
    showScreen("screen-video-intro");
  });

  initVideoScreen(document.getElementById("screen-video-intro"), "btn-continue-video-intro");
  document.getElementById("btn-continue-video-intro").addEventListener("click", function () {
    showScreen("screen-q1");
  });
  document.getElementById("btn-back-video-intro").addEventListener("click", function () {
    showScreen("screen-opening");
  });

  /* ---------- Screen 5: net-hole-size dropdown fill-in ---------- */

  var q5Screen = document.getElementById("screen-q5");
  var q5FillSelects = Array.prototype.slice.call(q5Screen.querySelectorAll(".fill-select"));

  q5FillSelects.forEach(arrangeFillSelectOptions);

  var q5Check = document.getElementById("btn-check-q5");
  var q5FeedbackPanel = document.getElementById("feedback-panel-q5");
  var q5FeedbackText = document.getElementById("feedback-text-q5");
  var q5FeedbackIcon = q5FeedbackPanel.querySelector(".feedback-icon");
  var continueQ5Btn = document.getElementById("btn-continue-q5");
  var Q5_MAX_ATTEMPTS = 2;
  var q5Attempts = 0;
  var q5Locked = false;

  function q5AllChosen() {
    return q5FillSelects.every(function (s) { return s.value !== ""; });
  }

  function q5ClearResult() {
    q5FillSelects.forEach(function (s) {
      if (s.disabled) {
        return;
      }
      s.classList.remove("correct", "wrong");
      clearFillBadge(s);
    });
    q5FeedbackPanel.hidden = true;
    q5FeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
  }

  q5FillSelects.forEach(function (select) {
    select.addEventListener("change", function () {
      if (q5Locked) {
        return;
      }
      q5ClearResult();
      q5Check.hidden = !q5AllChosen();
    });
  });

  q5Check.addEventListener("click", function () {
    if (q5Locked || !q5AllChosen()) {
      return;
    }
    q5Attempts += 1;

    var allCorrect = true;
    q5FillSelects.forEach(function (select) {
      var ok = select.value === select.getAttribute("data-answer");
      select.classList.toggle("correct", ok);
      select.classList.toggle("wrong", !ok);
      setFillBadge(select, ok);
      if (!ok) {
        allCorrect = false;
      }
    });

    var q5CorrectCount = q5FillSelects.filter(function (s) {
      return s.classList.contains("correct");
    }).length;

    q5FeedbackPanel.hidden = false;

    if (allCorrect) {
      recordScore("q5", 1);
      q5Locked = true;
      q5Check.hidden = true;
      q5FillSelects.forEach(function (select) { select.disabled = true; });
      q5FeedbackIcon.hidden = false;
      q5FeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q5FeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
      q5FeedbackText.innerHTML = "<strong>תשובה נכונה!</strong>התקדמו לשאלה הבאה";
      continueQ5Btn.hidden = false;
    } else if (q5Attempts < Q5_MAX_ATTEMPTS) {
      // Correctly-answered blanks lock in place -- only the still-wrong ones
      // stay open for the second attempt, same as the other question screens.
      q5FillSelects.forEach(function (select) {
        if (select.classList.contains("correct")) {
          select.disabled = true;
        }
      });
      q5FeedbackIcon.hidden = false;
      q5FeedbackIcon.src = "assets/smily.png";
      q5FeedbackPanel.classList.add("feedback-panel--wrong");
      q5FeedbackText.innerHTML = "<strong>נסו שנית</strong>";
      q5Check.hidden = false;
    } else {
      recordScore("q5", q5CorrectCount / q5FillSelects.length);
      q5Locked = true;
      q5Check.hidden = true;
      q5FillSelects.forEach(function (select) {
        var wasCorrect = select.classList.contains("correct");
        select.value = select.getAttribute("data-answer");
        select.classList.remove("wrong");
        select.classList.toggle("correct", wasCorrect);
        select.classList.toggle("revealed", !wasCorrect);
        setFillBadge(select, true, !wasCorrect);
        select.disabled = true;
      });
      q5FeedbackIcon.hidden = false;
      q5FeedbackIcon.src = "assets/reveal v2.png";
      q5FeedbackPanel.classList.add("feedback-panel--reveal");
      q5FeedbackText.innerHTML = "<strong>לא נורא!</strong>כך משלימים את המשפטים נכון.";
      continueQ5Btn.hidden = false;
    }
  });

  continueQ5Btn.addEventListener("click", function () {
    showScreen("screen-q6");
  });
  document.getElementById("btn-back-q5").addEventListener("click", function () {
    showScreen("screen-video1");
  });

  /* ---------- Screen 6: sentence-ordering drag-and-drop ---------- */

  var Q6_ITEMS = {
    growth: { text: "האוכלוסייה בכפר גדלה ויש דרישה ליותר מזון", order: 1 },
    overfishing: { text: "הדייגים מגבירים את קצב הדיג ומשתמשים ברשתות צפופות יותר כדי לתפוס יותר דגים", order: 2 },
    juveniles: { text: "דגים קטנים (צעירים) נלכדים לפני שהספיקו להתרבות ולהעמיד דור חדש", order: 3 },
    decline: { text: "לאורך הזמן, כמות הדגים בלגונה צונחת בצורה חדה", order: 4 },
    empty: { text: "הרשתות חוזרות ריקות, והכפר סובל מרעב ומפגיעה כלכלית", order: 5 }
  };
  var Q6_ORDER = ["growth", "overfishing", "juveniles", "decline", "empty"];

  var q6StatusEl = document.getElementById("sort-status-q6");
  var q6TrayEl = document.getElementById("q6-tray");
  var q6Cells = Array.prototype.slice.call(document.querySelectorAll(".q6-cell"));
  var q6Check = document.getElementById("btn-check-q6");
  var q6FeedbackPanel = document.getElementById("feedback-panel-q6");
  var q6FeedbackText = document.getElementById("feedback-text-q6");
  var q6FeedbackIcon = q6FeedbackPanel.querySelector(".feedback-icon");
  var continueQ6Btn = document.getElementById("btn-continue-q6");

  // Shuffled fresh on every load so the tray never starts in solved order.
  var q6TrayOrder = Q6_ORDER.slice();
  for (var q6i = q6TrayOrder.length - 1; q6i > 0; q6i--) {
    var q6j = Math.floor(Math.random() * (q6i + 1));
    var q6tmp = q6TrayOrder[q6i];
    q6TrayOrder[q6i] = q6TrayOrder[q6j];
    q6TrayOrder[q6j] = q6tmp;
  }

  var q6CellItem = {};
  q6Cells.forEach(function (cell) { q6CellItem[cell.id] = null; });

  var q6Picked = null; // { item, from: 'tray' | cellId }
  var Q6_MAX_ATTEMPTS = 2;
  var q6Attempts = 0;
  var q6Locked = false;

  function q6Announce(message) {
    q6StatusEl.textContent = "";
    setTimeout(function () {
      q6StatusEl.textContent = message;
    }, 30);
  }

  function q6EmptyCellLabel(cell) {
    var row = Number(cell.getAttribute("data-row")) + 1;
    return "תא ריק, שורה " + row;
  }

  function q6ClearFeedback() {
    q6Cells.forEach(function (cell) {
      if (cell.disabled) {
        return;
      }
      cell.classList.remove("correct", "wrong");
    });
    q6FeedbackPanel.hidden = true;
  }

  function q6RenderTray() {
    q6TrayEl.innerHTML = "";
    q6TrayOrder.forEach(function (id) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "q6-plank";
      btn.draggable = true;
      btn.setAttribute("data-item", id);
      btn.setAttribute("aria-pressed", q6Picked && q6Picked.from === "tray" && q6Picked.item === id ? "true" : "false");
      var text = document.createElement("span");
      text.className = "q6-plank-text";
      text.textContent = Q6_ITEMS[id].text;
      btn.appendChild(text);
      btn.addEventListener("click", function () {
        q6OnTrayPlankClick(id);
      });
      btn.addEventListener("dragstart", function (e) {
        if (q6Locked) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "tray:" + id);
        btn.classList.add("dragging");
      });
      btn.addEventListener("dragend", function () {
        btn.classList.remove("dragging");
      });
      li.appendChild(btn);
      q6TrayEl.appendChild(li);
    });
  }

  function q6RenderCell(cell) {
    var id = q6CellItem[cell.id];
    cell.innerHTML = "";
    if (id) {
      cell.draggable = true;
      cell.setAttribute("data-item", id);
      cell.setAttribute("aria-pressed", q6Picked && q6Picked.from === cell.id ? "true" : "false");
      cell.setAttribute("aria-label", Q6_ITEMS[id].text + (q6Picked && q6Picked.from === cell.id ? " — נבחר" : ""));
      var text = document.createElement("span");
      text.className = "q6-plank-text";
      text.textContent = Q6_ITEMS[id].text;
      cell.appendChild(text);
    } else {
      cell.draggable = false;
      cell.removeAttribute("data-item");
      cell.removeAttribute("aria-pressed");
      cell.setAttribute("aria-label", q6EmptyCellLabel(cell));
    }
  }

  function q6ParseDragSource(dataTransfer) {
    var raw = dataTransfer.getData("text/plain");
    if (raw.indexOf("tray:") === 0) {
      return { item: raw.slice(5), from: "tray" };
    }
    if (raw.indexOf("cell:") === 0) {
      var cellId = raw.slice(5);
      return { item: q6CellItem[cellId], from: cellId };
    }
    return null;
  }

  function q6MoveSourceToEmptyCell(source, cell) {
    if (source.from === "tray") {
      q6TrayOrder.splice(q6TrayOrder.indexOf(source.item), 1);
    } else {
      q6CellItem[source.from] = null;
    }
    q6CellItem[cell.id] = source.item;
  }

  function q6SwapSourceWithCell(source, cell) {
    var otherId = q6CellItem[cell.id];
    if (source.from === "tray") {
      q6CellItem[cell.id] = source.item;
      q6TrayOrder.splice(q6TrayOrder.indexOf(source.item), 1);
      q6TrayOrder.push(otherId);
    } else {
      q6CellItem[source.from] = otherId;
      q6CellItem[cell.id] = source.item;
    }
    return otherId;
  }

  function q6RenderAll() {
    q6RenderTray();
    q6Cells.forEach(q6RenderCell);
    if (!q6Locked) {
      q6Check.hidden = q6TrayOrder.length > 0;
    }
  }

  function q6OnTrayPlankClick(id) {
    if (q6Locked) {
      return;
    }
    q6ClearFeedback();
    if (!q6Picked) {
      q6Picked = { item: id, from: "tray" };
      q6Announce(Q6_ITEMS[id].text + " נבחר. בחרו תא בטבלה כדי להניח אותו שם.");
      q6RenderAll();
      return;
    }
    if (q6Picked.from === "tray" && q6Picked.item === id) {
      q6Picked = null;
      q6Announce("הבחירה בוטלה.");
      q6RenderAll();
      return;
    }
    q6Picked = { item: id, from: "tray" };
    q6Announce(Q6_ITEMS[id].text + " נבחר. בחרו תא בטבלה כדי להניח אותו שם.");
    q6RenderAll();
  }

  function q6OnCellClick(cell) {
    if (q6Locked || cell.disabled) {
      return;
    }
    q6ClearFeedback();
    var id = q6CellItem[cell.id];

    if (!id) {
      if (!q6Picked) {
        return;
      }
      var placedText = Q6_ITEMS[q6Picked.item].text;
      q6MoveSourceToEmptyCell(q6Picked, cell);
      q6Picked = null;
      q6RenderAll();
      cell.focus();
      q6Announce(placedText + " הונח ב" + q6EmptyCellLabel(cell).replace("תא ריק, ", ""));
      return;
    }

    if (!q6Picked) {
      q6Picked = { item: id, from: cell.id };
      q6Announce(Q6_ITEMS[id].text + " נבחר. בחרו תא אחר או פריט אחר כדי להחליף.");
      q6RenderAll();
      return;
    }
    if (q6Picked.from === cell.id) {
      q6Picked = null;
      q6Announce("הבחירה בוטלה.");
      q6RenderAll();
      return;
    }

    var textA = Q6_ITEMS[q6Picked.item].text;
    var otherId = q6SwapSourceWithCell(q6Picked, cell);
    q6Picked = null;
    q6RenderAll();
    cell.focus();
    q6Announce(textA + " ו" + Q6_ITEMS[otherId].text + " הוחלפו במקומם.");
  }

  q6Cells.forEach(function (cell) {
    cell.addEventListener("click", function () {
      q6OnCellClick(cell);
    });

    cell.addEventListener("dragstart", function (e) {
      var id = q6CellItem[cell.id];
      if (!id || q6Locked || cell.disabled) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "cell:" + cell.id);
      cell.classList.add("dragging");
    });
    cell.addEventListener("dragend", function () {
      cell.classList.remove("dragging");
    });

    cell.addEventListener("dragover", function (e) {
      if (cell.disabled) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    cell.addEventListener("dragenter", function () {
      if (cell.disabled) {
        return;
      }
      cell.classList.add("drag-over");
    });
    cell.addEventListener("dragleave", function () {
      cell.classList.remove("drag-over");
    });
    cell.addEventListener("drop", function (e) {
      e.preventDefault();
      cell.classList.remove("drag-over");
      if (q6Locked || cell.disabled) {
        return;
      }
      var source = q6ParseDragSource(e.dataTransfer);
      if (!source || source.item == null || source.from === cell.id) {
        return;
      }
      q6ClearFeedback();
      q6Picked = null;
      var id = q6CellItem[cell.id];
      var sourceText = Q6_ITEMS[source.item].text;
      if (!id) {
        q6MoveSourceToEmptyCell(source, cell);
        q6RenderAll();
        q6Announce(sourceText + " הונח ב" + q6EmptyCellLabel(cell).replace("תא ריק, ", ""));
      } else {
        var otherId = q6SwapSourceWithCell(source, cell);
        q6RenderAll();
        q6Announce(sourceText + " ו" + Q6_ITEMS[otherId].text + " הוחלפו במקומם.");
      }
    });
  });

  q6TrayEl.addEventListener("click", function (e) {
    if (q6Locked || e.target !== q6TrayEl || !q6Picked || q6Picked.from === "tray") {
      return;
    }
    var text = Q6_ITEMS[q6Picked.item].text;
    q6CellItem[q6Picked.from] = null;
    q6TrayOrder.push(q6Picked.item);
    q6Picked = null;
    q6RenderAll();
    q6Announce(text + " הוחזר לרשימת הפריטים.");
  });

  var q6TrayDragDepth = 0;

  q6TrayEl.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  q6TrayEl.addEventListener("dragenter", function () {
    q6TrayDragDepth += 1;
    q6TrayEl.classList.add("drag-over");
  });
  q6TrayEl.addEventListener("dragleave", function () {
    q6TrayDragDepth = Math.max(0, q6TrayDragDepth - 1);
    if (q6TrayDragDepth === 0) {
      q6TrayEl.classList.remove("drag-over");
    }
  });
  q6TrayEl.addEventListener("drop", function (e) {
    e.preventDefault();
    q6TrayDragDepth = 0;
    q6TrayEl.classList.remove("drag-over");
    if (q6Locked) {
      return;
    }
    var source = q6ParseDragSource(e.dataTransfer);
    if (!source || source.from === "tray") {
      return;
    }
    q6ClearFeedback();
    q6Picked = null;
    var text = Q6_ITEMS[source.item].text;
    q6CellItem[source.from] = null;
    q6TrayOrder.push(source.item);
    q6RenderAll();
    q6Announce(text + " הוחזר לרשימת הפריטים.");
  });

  function q6LockExercise() {
    q6Locked = true;
    q6Check.disabled = true;
  }

  function q6RevealAnswer() {
    var alreadyCorrect = {};
    q6Cells.forEach(function (cell) {
      var id = q6CellItem[cell.id];
      var row = Number(cell.getAttribute("data-row"));
      if (id && cell.disabled && Q6_ITEMS[id].order === row + 1) {
        alreadyCorrect[id] = true;
      } else {
        q6CellItem[cell.id] = null;
      }
    });
    q6TrayOrder = [];
    q6Cells.forEach(function (cell) {
      if (q6CellItem[cell.id]) {
        return;
      }
      var row = Number(cell.getAttribute("data-row"));
      var id = Q6_ORDER.filter(function (itemId) { return !alreadyCorrect[itemId]; })
        .find(function (itemId) { return Q6_ITEMS[itemId].order === row + 1; });
      q6CellItem[cell.id] = id;
    });
  }

  q6RenderAll();

  q6Check.addEventListener("click", function () {
    if (q6Locked) {
      return;
    }
    if (q6Picked) {
      q6Picked = null;
      q6RenderAll();
    }

    q6Attempts += 1;

    var allCorrect = true;
    q6Cells.forEach(function (cell) {
      var id = q6CellItem[cell.id];
      var row = Number(cell.getAttribute("data-row"));
      var isCorrect = !!id && Q6_ITEMS[id].order === row + 1;
      cell.classList.toggle("correct", isCorrect);
      cell.classList.toggle("wrong", !isCorrect);
      if (isCorrect) {
        cell.setAttribute("aria-label", Q6_ITEMS[id].text + " — במקום הנכון");
        cell.disabled = true;
      } else {
        allCorrect = false;
        if (id) {
          cell.setAttribute("aria-label", Q6_ITEMS[id].text + " — לא במקום הנכון");
        }
      }
    });

    var q6CorrectCells = q6Cells.filter(function (cell) {
      return cell.classList.contains("correct");
    });
    var q6CorrectCount = q6CorrectCells.length;
    var q6LearnerCorrectCellIds = {};
    q6CorrectCells.forEach(function (cell) {
      q6LearnerCorrectCellIds[cell.id] = true;
    });

    q6FeedbackPanel.hidden = false;
    q6FeedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");

    if (allCorrect) {
      recordScore("q6", 1);
      q6LockExercise();
      q6FeedbackIcon.hidden = false;
      q6FeedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
      q6FeedbackText.innerHTML = "<strong>תשובה נכונה!</strong>הצלחתם לסדר את המשפטים בסדר הנכון.";
      q6Announce("כל הכבוד! כל המשפטים בסדר הנכון.");
      continueQ6Btn.hidden = false;
    } else if (q6Attempts < Q6_MAX_ATTEMPTS) {
      q6FeedbackIcon.hidden = true;
      q6FeedbackPanel.classList.add("feedback-panel--wrong");
      q6FeedbackText.innerHTML = "<strong>כמעט!</strong>בדקו את הפריטים המסומנים באדום ונסו שוב. נותר לכם עוד נסיון אחד.";
      q6Announce("חלק מהמשפטים עדיין לא במקום הנכון. נותר לכם עוד נסיון אחד.");
      window.setTimeout(function () {
        if (q6Locked) {
          return;
        }
        q6FeedbackPanel.hidden = true;
        q6Cells.forEach(function (cell) {
          if (!cell.classList.contains("wrong")) {
            return;
          }
          var wrongId = q6CellItem[cell.id];
          if (wrongId == null) {
            return;
          }
          q6CellItem[cell.id] = null;
          q6TrayOrder.push(wrongId);
          cell.classList.remove("wrong");
        });
        q6RenderAll();
      }, 5000);
    } else {
      recordScore("q6", q6CorrectCount / q6Cells.length);
      q6RevealAnswer();
      q6RenderAll();
      q6Cells.forEach(function (cell) {
        var id = q6CellItem[cell.id];
        cell.classList.remove("wrong");
        if (q6LearnerCorrectCellIds[cell.id]) {
          cell.classList.add("correct");
          cell.setAttribute("aria-label", Q6_ITEMS[id].text + " — במקום הנכון");
        } else {
          cell.classList.add("revealed");
          cell.setAttribute("aria-label", Q6_ITEMS[id].text + " — הסדר הנכון מוצג");
        }
        cell.disabled = true;
      });
      q6LockExercise();
      q6FeedbackIcon.hidden = false;
      q6FeedbackIcon.src = "assets/reveal v2.png";
      q6FeedbackPanel.classList.add("feedback-panel--reveal");
      q6FeedbackText.innerHTML = "<strong>לא נורא!</strong>כך הסדר הנכון נראה.";
      q6Announce("נגמרו הנסיונות. הסדר הנכון מוצג כעת בטבלה.");
      continueQ6Btn.hidden = false;
    }
  });

  document.getElementById("btn-back-q6").addEventListener("click", function () {
    showScreen("screen-q5");
  });

  setupHelpDialog(
    document.getElementById("btn-help-open-q6"),
    document.getElementById("btn-help-close-q6"),
    document.getElementById("help-overlay-q6"),
    document.getElementById("help-dialog-q6")
  );

  continueQ6Btn.addEventListener("click", function () {
    showScreen("screen-video3");
  });

  /* ---------- Video placeholder 3 (between q6 and q7a) ---------- */

  initVideoScreen(document.getElementById("screen-video3"), "btn-continue-video3");

  document.getElementById("btn-continue-video3").addEventListener("click", function () {
    showScreen("screen-q7a");
  });
  document.getElementById("btn-back-video3").addEventListener("click", function () {
    showScreen("screen-q6");
  });

  /* ---------- Screens 7a/7b: single-choice with per-distractor feedback ----------
     Same engine as screen-q2b's, just scoped to each screen's own elements.
     opts.wrongPrefix/wrongSuffix let a screen show its own "זו טעות." / "נסו
     שנית." wrapper text around each distractor's data-feedback, instead of the
     plain unlabeled text q2b/q7a use. opts.firstWrongText, when set, replaces
     that detailed text with a generic nudge on the FIRST wrong attempt only
     (matching the other question screens' plain "try again" message) -- the
     detailed per-distractor text then shows starting on the final attempt.
     opts.revealOnExhausted (default true) controls whether running out of
     attempts force-reveals the correct option, or just shows the last-picked
     option's own detailed feedback without marking the correct one. */
  function initSingleChoice(prefix, nextScreenId, opts) {
    opts = opts || {};
    var correctPrefix = opts.correctPrefix || "מצוין!";
    var wrongPrefix = opts.wrongPrefix || null;
    var wrongSuffix = opts.wrongSuffix || "";
    var firstWrongText = opts.firstWrongText || null;
    var genericCorrectText = opts.genericCorrectText || null;
    var genericRevealText = opts.genericRevealText || null;
    var revealOnExhausted = opts.revealOnExhausted !== false;
    var options = Array.prototype.slice.call(document.querySelectorAll("#" + prefix + "-options .q-opt"));
    var check = document.getElementById("btn-check-" + prefix);
    var feedbackPanel = document.getElementById("feedback-panel-" + prefix);
    var feedbackText = document.getElementById("feedback-text-" + prefix);
    var feedbackIcon = feedbackPanel.querySelector(".feedback-icon");
    var continueBtn = document.getElementById("btn-continue-" + prefix);
    var MAX_ATTEMPTS = 2;
    var attempts = 0;
    var locked = false;
    var selected = null;

    var correct = options.filter(function (opt) {
      return opt.getAttribute("data-correct") === "true";
    })[0];

    function clearResult() {
      options.forEach(function (opt) {
        opt.classList.remove("correct", "wrong");
      });
      feedbackPanel.hidden = true;
      feedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
    }

    options.forEach(function (opt) {
      opt.addEventListener("click", function () {
        if (locked) {
          return;
        }
        clearResult();
        options.forEach(function (o) {
          o.classList.remove("selected");
          o.setAttribute("aria-checked", "false");
        });
        opt.classList.add("selected");
        opt.setAttribute("aria-checked", "true");
        selected = opt;
        check.hidden = false;
      });
    });

    check.addEventListener("click", function () {
      if (locked || !selected) {
        return;
      }
      attempts += 1;

      var ok = selected === correct;
      feedbackPanel.hidden = false;

      if (ok) {
        recordScore(prefix, 1);
        locked = true;
        check.hidden = true;
        selected.classList.add("correct");
        options.forEach(function (o) { o.disabled = true; });
        feedbackIcon.hidden = false;
        feedbackIcon.src = "assets/ChatGPT Image Aug 9, 2026, 11_40_50 AM.png";
        feedbackPanel.classList.remove("feedback-panel--wrong", "feedback-panel--reveal");
        feedbackText.innerHTML = "<strong>" + correctPrefix + "</strong>" +
          (genericCorrectText || selected.getAttribute("data-feedback"));
        if (continueBtn) {
          continueBtn.hidden = false;
        }
      } else if (attempts < MAX_ATTEMPTS) {
        selected.classList.add("wrong");
        feedbackIcon.hidden = false;
        feedbackIcon.src = "assets/smily.png";
        feedbackPanel.classList.add("feedback-panel--wrong");
        if (firstWrongText) {
          feedbackText.innerHTML = "<strong>" + firstWrongText + "</strong>";
        } else if (wrongPrefix) {
          feedbackText.innerHTML = "<strong>" + wrongPrefix + "</strong>" + selected.getAttribute("data-feedback") +
            (wrongSuffix ? "<br>" + wrongSuffix : "");
        } else {
          feedbackText.textContent = selected.getAttribute("data-feedback");
        }
        check.hidden = false;
      } else {
        recordScore(prefix, 0);
        locked = true;
        check.hidden = true;
        selected.classList.add("wrong");
        correct.classList.add("revealed");
        options.forEach(function (o) { o.disabled = true; });
        if (revealOnExhausted) {
          feedbackIcon.hidden = false;
          feedbackIcon.src = "assets/reveal v2.png";
          feedbackPanel.classList.add("feedback-panel--reveal");
          feedbackText.innerHTML = genericRevealText
            ? "<strong>לא נורא!</strong>" + genericRevealText
            : correct.getAttribute("data-feedback");
        } else {
          feedbackIcon.hidden = false;
          feedbackIcon.src = "assets/reveal v2.png";
          feedbackPanel.classList.add("feedback-panel--wrong");
          if (wrongPrefix) {
            feedbackText.innerHTML = "<strong>" + wrongPrefix + "</strong>" + selected.getAttribute("data-feedback") +
              (wrongSuffix ? "<br>" + wrongSuffix : "");
          } else {
            feedbackText.textContent = selected.getAttribute("data-feedback");
          }
        }
        if (continueBtn) {
          continueBtn.hidden = false;
        }
      }
    });

    if (continueBtn && nextScreenId) {
      continueBtn.addEventListener("click", function () {
        showScreen(nextScreenId);
      });
    }
  }

  initSingleChoice("q7a", "screen-q7b", {
    firstWrongText: "נסו שנית",
    correctPrefix: "תשובה נכונה!",
    genericCorrectText: "התקדמו לשאלה הבאה",
    genericRevealText: "כך פותרים את השאלה נכון."
  });
  initSingleChoice("q7b", "screen-q8a", {
    correctPrefix: "תשובה נכונה!",
    wrongPrefix: "זו טעות.",
    wrongSuffix: "נסו שנית.",
    firstWrongText: "זאת טעות, נסו שוב.",
    revealOnExhausted: false
  });

  document.getElementById("btn-back-q7a").addEventListener("click", function () {
    showScreen("screen-video3");
  });
  document.getElementById("btn-back-q7b").addEventListener("click", function () {
    showScreen("screen-q7a");
  });

  /* ---------- Shared image-zoom modal (any screen's [data-zoom-src] button) ---------- */

  (function setupImageZoom() {
    var overlay = document.getElementById("img-zoom-overlay");
    var img = document.getElementById("img-zoom-full");
    if (!overlay || !img) {
      return;
    }
    var closeBtn = document.getElementById("img-zoom-close");

    function openZoom(src, alt) {
      img.src = src;
      img.alt = alt || "";
      overlay.hidden = false;
    }
    function closeZoom() {
      overlay.hidden = true;
      img.src = "";
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-zoom-src]"), function (btn) {
      btn.addEventListener("click", function () {
        openZoom(btn.getAttribute("data-zoom-src"), btn.getAttribute("data-zoom-alt"));
      });
    });
    closeBtn.addEventListener("click", closeZoom);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeZoom();
      }
    });
  })();

  /* ---------- Screen 8a: place ideas into the open rulebook ----------
     Any of the 4 cards may go into any of the 4 slots (no correct/incorrect
     mapping -- this is an open reflection question, not a graded one). Two
     equivalent ways to place a card: (1) drag the picture onto a slot (mouse/
     touch), or (2) click/Enter a card to "pick" it, then click/Enter a slot
     to place it there -- same pick-then-place pattern as screens 1/3/4/6
     (see onTrayPillClick/onCellClick above). Once placed, the source card's
     picture fades (opacity, not hidden) so its caption text stays legible as
     a reminder of which idea went where. בדיקה enables as soon as 1 idea is
     placed -- the learner isn't required to place all 4, only the ones they
     agree with -- and when pressed just locks the board and shows a
     completion message. */
  (function q8a() {
    var CARD_IDS = ["1", "2", "3", "4"];
    var SLOT_IDS = ["q8a-slot-1", "q8a-slot-2", "q8a-slot-3", "q8a-slot-4"];
    var slotFill = {}; // slotId -> cardId | null
    SLOT_IDS.forEach(function (id) { slotFill[id] = null; });

    var cardImgs = {};
    CARD_IDS.forEach(function (id) {
      cardImgs[id] = document.getElementById("q8a-img-" + id);
    });
    var cardAlt = {};
    CARD_IDS.forEach(function (id) {
      cardAlt[id] = cardImgs[id].querySelector("img").getAttribute("alt");
    });
    var slots = SLOT_IDS.map(function (id) { return document.getElementById(id); });
    var slotEmptyLabel = {};
    slots.forEach(function (slot) {
      slotEmptyLabel[slot.id] = slot.getAttribute("aria-label");
    });
    var sourceEl = document.getElementById("q8a-source");
    var checkBtn = document.getElementById("btn-check-q8a");
    var continueBtn = document.getElementById("btn-continue-q8a");
    var feedbackPanel = document.getElementById("feedback-panel-q8a");
    var statusEl = document.getElementById("sort-status-q8a");
    var locked = false;
    var picked = null; // { from: "source" | slotId, cardId }

    function announce(message) {
      statusEl.textContent = "";
      window.setTimeout(function () {
        statusEl.textContent = message;
      }, 30);
    }

    function cardUsed(cardId) {
      return SLOT_IDS.some(function (sid) { return slotFill[sid] === cardId; });
    }

    function updateCard(cardId) {
      var used = cardUsed(cardId);
      var btn = cardImgs[cardId];
      var isPicked = !!picked && picked.from === "source" && picked.cardId === cardId;
      btn.classList.toggle("q8a-card-drag--placed", used);
      btn.draggable = !used && !locked;
      btn.setAttribute("aria-disabled", used ? "true" : "false");
      btn.setAttribute("aria-pressed", isPicked ? "true" : "false");
    }

    function updateSlot(slot) {
      var cardId = slotFill[slot.id];
      var isPicked = !!picked && picked.from === slot.id;
      slot.innerHTML = "";
      slot.classList.toggle("filled", !!cardId);
      slot.draggable = !!cardId && !locked;
      slot.setAttribute("aria-pressed", isPicked ? "true" : "false");
      if (!cardId) {
        slot.setAttribute("aria-label", slotEmptyLabel[slot.id]);
        return;
      }
      slot.setAttribute("aria-label", cardAlt[cardId] + (isPicked ? " — נבחר" : ""));
      var img = document.createElement("img");
      img.className = "q8a-slot-img";
      img.src = "assets/q8a " + cardId + ".png";
      img.alt = "";
      slot.appendChild(img);
    }

    function renderAll() {
      CARD_IDS.forEach(updateCard);
      slots.forEach(updateSlot);
    }

    function updateCheck() {
      if (locked) {
        return;
      }
      // The learner isn't required to place all 4 -- בדיקה becomes available
      // as soon as at least one idea has been placed in the book.
      var filled = SLOT_IDS.filter(function (sid) { return slotFill[sid]; }).length;
      checkBtn.hidden = filled < 1;
    }

    function placeCardInSlot(cardId, slot) {
      var displaced = slotFill[slot.id];
      slotFill[slot.id] = cardId;
      renderAll();
      updateCheck();
      return displaced;
    }

    function moveSlotToSlot(fromSlot, toSlot) {
      var moving = slotFill[fromSlot.id];
      var displaced = slotFill[toSlot.id];
      slotFill[fromSlot.id] = displaced || null;
      slotFill[toSlot.id] = moving;
      renderAll();
      updateCheck();
    }

    function clearSlot(slot) {
      var cardId = slotFill[slot.id];
      if (!cardId) {
        return null;
      }
      slotFill[slot.id] = null;
      renderAll();
      updateCheck();
      return cardId;
    }

    function onCardClick(cardId) {
      if (locked || cardUsed(cardId)) {
        return;
      }
      if (picked && picked.from === "source" && picked.cardId === cardId) {
        picked = null;
        announce("הבחירה בוטלה.");
        renderAll();
        return;
      }
      picked = { from: "source", cardId: cardId };
      announce(cardAlt[cardId] + " נבחר. בחרו מקום ריק בספר החוקים כדי להניח אותו שם.");
      renderAll();
    }

    function onSlotClick(slot) {
      if (locked) {
        return;
      }
      var filledId = slotFill[slot.id];

      if (picked) {
        if (picked.from === "source") {
          var placedLabel = cardAlt[picked.cardId];
          var displaced = placeCardInSlot(picked.cardId, slot);
          picked = null;
          if (displaced) {
            announce(placedLabel + " הונח בספר החוקים, ו" + cardAlt[displaced] + " הוחזר לרשימת הרעיונות.");
          } else {
            announce(placedLabel + " הונח בספר החוקים.");
          }
          return;
        }
        // picked.from is a slot id.
        if (picked.from === slot.id) {
          var removed = clearSlot(slot);
          picked = null;
          announce(cardAlt[removed] + " הוחזר לרשימת הרעיונות.");
          return;
        }
        var movingLabel = cardAlt[slotFill[picked.from]];
        moveSlotToSlot(document.getElementById(picked.from), slot);
        picked = null;
        announce(movingLabel + " הועבר למקום אחר בספר החוקים.");
        return;
      }

      // No pick in progress: selecting an already-placed idea lets the
      // learner move it elsewhere, or click it again to return it.
      if (!filledId) {
        return;
      }
      picked = { from: slot.id, cardId: filledId };
      announce(cardAlt[filledId] + " נבחר. בחרו מקום אחר בספר כדי להעביר אליו, או לחצו כאן שוב כדי להחזיר אותו לרשימה.");
      renderAll();
    }

    CARD_IDS.forEach(function (id) {
      var btn = cardImgs[id];
      btn.addEventListener("click", function () {
        onCardClick(id);
      });
      btn.addEventListener("dragstart", function (e) {
        if (locked || cardUsed(id)) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "card:" + id);
        btn.classList.add("dragging");
      });
      btn.addEventListener("dragend", function () {
        btn.classList.remove("dragging");
      });
    });

    slots.forEach(function (slot) {
      slot.addEventListener("click", function () {
        onSlotClick(slot);
      });
      slot.addEventListener("dragstart", function (e) {
        if (locked || !slotFill[slot.id]) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "slot:" + slot.id);
        slot.classList.add("dragging");
      });
      slot.addEventListener("dragend", function () {
        slot.classList.remove("dragging");
      });
      slot.addEventListener("dragover", function (e) {
        if (locked) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      slot.addEventListener("dragenter", function () {
        if (!locked) {
          slot.classList.add("drag-over");
        }
      });
      slot.addEventListener("dragleave", function () {
        slot.classList.remove("drag-over");
      });
      slot.addEventListener("drop", function (e) {
        e.preventDefault();
        slot.classList.remove("drag-over");
        if (locked) {
          return;
        }
        var raw = e.dataTransfer.getData("text/plain");
        if (raw.indexOf("card:") === 0) {
          var cardId = raw.slice(5);
          if (slotFill[slot.id] !== cardId) {
            placeCardInSlot(cardId, slot);
          }
        } else if (raw.indexOf("slot:") === 0) {
          var fromId = raw.slice(5);
          if (fromId !== slot.id) {
            var fromSlot = document.getElementById(fromId);
            moveSlotToSlot(fromSlot, slot);
          }
        }
        picked = null;
      });
    });

    // Dropping a placed picture back onto the source row removes it from
    // its slot -- lets the learner undo a placement.
    sourceEl.addEventListener("dragover", function (e) {
      if (locked) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    sourceEl.addEventListener("drop", function (e) {
      e.preventDefault();
      if (locked) {
        return;
      }
      var raw = e.dataTransfer.getData("text/plain");
      if (raw.indexOf("slot:") === 0) {
        var fromSlot = document.getElementById(raw.slice(5));
        clearSlot(fromSlot);
        picked = null;
      }
    });

    checkBtn.addEventListener("click", function () {
      locked = true;
      picked = null;
      checkBtn.hidden = true;
      slots.forEach(function (slot) { slot.disabled = true; });
      CARD_IDS.forEach(function (id) { cardImgs[id].disabled = true; });
      renderAll();
      feedbackPanel.hidden = false;
      continueBtn.hidden = false;

      // Publish the final placement for screen 8b to render into the book.
      window.q8aPlacement = SLOT_IDS.map(function (sid) { return slotFill[sid]; });
    });

    document.getElementById("btn-back-q8a").addEventListener("click", function () {
      showScreen("screen-q7b");
    });
    continueBtn.addEventListener("click", function () {
      showScreen("screen-q8b");
    });
  })();

  /* ---------- Screen 8b: reveal -- the picked ideas now sit in the rulebook ----------
     Pure narration/reveal screen, no interaction: renders whichever pictures
     the learner actually placed on screen 8a (could be 1-4, not necessarily
     all of them) into the matching slot position in the book the chief is
     holding. Continue is active immediately. */
  (function q8b() {
    var picsEl = document.getElementById("q8b-book-pics");

    document.getElementById("btn-back-q8b").addEventListener("click", function () {
      showScreen("screen-q8a");
    });
    document.getElementById("btn-continue-q8b").addEventListener("click", function () {
      showScreen("screen-video-q8-end");
    });

    var renderedFor = null;
    function render() {
      var placement = window.q8aPlacement || ["1", "2", "3", "4"];
      var key = placement.join(",");
      if (key === renderedFor) {
        return;
      }
      renderedFor = key;
      picsEl.innerHTML = "";
      placement.forEach(function (cardId, i) {
        if (!cardId) {
          return;
        }
        var img = document.createElement("img");
        img.className = "q8b-pic q8b-pic--" + (i + 1);
        img.src = "assets/q8a " + cardId + ".png";
        img.alt = "";
        picsEl.appendChild(img);
      });
    }

    // Screen 8a hasn't necessarily run yet the first time this screen is
    // reached via the dev bar, so render with a fallback and re-render
    // whenever screen 8b actually becomes visible.
    render();
    var q8bScreen = document.getElementById("screen-q8b");
    new MutationObserver(function () {
      if (!q8bScreen.hidden) {
        render();
      }
    }).observe(q8bScreen, { attributes: true, attributeFilter: ["hidden"] });
  })();

  /* ---------- Video placeholder between Q8ב and the closing wrap-up text ---------- */
  initVideoScreen(document.getElementById("screen-video-q8-end"), "btn-continue-video-q8-end");

  document.getElementById("btn-continue-video-q8-end").addEventListener("click", function () {
    showScreen("screen-before-ending");
  });
  document.getElementById("btn-back-video-q8-end").addEventListener("click", function () {
    showScreen("screen-q8b");
  });

  /* ---------- Screen 9: closing wrap-up text ("before ending") ----------
     Plain narration screen, no interaction. */
  document.getElementById("btn-back-before-ending").addEventListener("click", function () {
    showScreen("screen-video-q8-end");
  });
  document.getElementById("btn-continue-before-ending").addEventListener("click", function () {
    showScreen("screen-ending");
  });

  /* ---------- Screen 10: completion screen -- final score + exit ----------
     Score is computed from questionScores (recorded by every graded question,
     screens 1-7; screen 8 is an ungraded reflection and never contributes)
     every time this screen becomes visible, not just once, so re-entering via
     back/forward or the dev bar always reflects the latest state. The X
     button is a placeholder "exit" -- window.close() only succeeds for a tab
     the script itself opened, which is not the case when this runs inside an
     LMS iframe; there is no confirmed real exit/completion contract with a
     host yet, so this just attempts the best available action and silently
     no-ops otherwise (see PROGRESS.md). */
  (function ending() {
    var scoreEl = document.getElementById("ending-score");
    var endingScreen = document.getElementById("screen-ending");

    function render() {
      scoreEl.textContent = computeFinalScorePercent();
    }
    render();
    new MutationObserver(function () {
      if (!endingScreen.hidden) {
        render();
      }
    }).observe(endingScreen, { attributes: true, attributeFilter: ["hidden"] });

    document.getElementById("btn-ending-close").addEventListener("click", function () {
      showScreen("screen-return");
    });
    document.getElementById("btn-back-ending").addEventListener("click", function () {
      showScreen("screen-before-ending");
    });
  })();
})();
