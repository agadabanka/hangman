/**
 * Hangman — TypeScript IL game spec using @engine SDK.
 *
 * Classic word-guessing game. A secret word is chosen and the player
 * guesses one letter at a time. Wrong guesses draw parts of a hangman
 * figure (head, body, left arm, right arm, left leg, right leg = 6 parts).
 * AI guesses based on letter frequency analysis of remaining possible words.
 */

import { defineGame } from '@engine/core';
import { consumeAction } from '@engine/input';
import {
  clearCanvas, drawRoundedRect, drawCircle,
  drawLabel, drawGameOver,
} from '@engine/render';
import { drawTouchOverlay } from '@engine/touch';
import { generateWordList, pickWord } from '@engine/text';

// ── Constants ───────────────────────────────────────────────────────

const CANVAS_W = 500;
const CANVAS_H = 550;
const MAX_WRONG = 6;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const LETTER_FREQ = 'etaoinsrhldcumfpgwybvkxjqz';

const BG_COLOR = '#1a1a2e';
const TEXT_COLOR = '#e0e0e0';
const ACCENT_COLOR = '#0f3460';
const CORRECT_COLOR = '#4CAF50';
const WRONG_COLOR = '#E53935';
const BLANK_COLOR = '#16213e';
const GALLOWS_COLOR = '#888888';
const BODY_COLOR = '#e0e0e0';

// Keyboard layout
const KB_ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];
const KB_KEY_W = 36;
const KB_KEY_H = 40;
const KB_GAP = 4;
const KB_Y = 400;

// ── Game Definition ─────────────────────────────────────────────────

const game = defineGame({
  display: {
    type: 'custom',
    width: 13,
    height: 14,
    cellSize: 36,
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    offsetX: 0,
    offsetY: 0,
    background: BG_COLOR,
  },
  input: {
    up:      { keys: ['ArrowUp', 'w'] },
    down:    { keys: ['ArrowDown', 's'] },
    left:    { keys: ['ArrowLeft', 'a'] },
    right:   { keys: ['ArrowRight', 'd'] },
    select:  { keys: [' ', 'Enter'] },
    restart: { keys: ['r', 'R'] },
  },
});

// ── Resources ───────────────────────────────────────────────────────

game.resource('state', {
  score: 0,
  gameOver: false,
  won: false,
  message: 'Guess a letter!',
  wrongCount: 0,
});

game.resource('board', {
  target: '',
  guessedLetters: {},
  wordList: [],
  initialized: false,
});

game.resource('_cursor', { row: 0, col: 0 });

game.resource('_aiTimer', { elapsed: 0 });

game.resource('_aiState', {
  possibleWords: [],
  phase: 'thinking', // 'thinking' | 'guessing' | 'waiting'
});

// ── Init System ─────────────────────────────────────────────────────

game.system('init', function initSystem(world, _dt) {
  const board = world.getResource('board');
  if (board.initialized) return;
  board.initialized = true;

  board.wordList = generateWordList();
  board.target = pickWord(board.wordList);
  board.guessedLetters = {};

  const aiState = world.getResource('_aiState');
  aiState.possibleWords = [...board.wordList];
  aiState.phase = 'thinking';
});

// ── Restart System ──────────────────────────────────────────────────

game.system('restart', function restartSystem(world, _dt) {
  const input = world.getResource('input');
  const state = world.getResource('state');

  if (consumeAction(input, 'restart') && state.gameOver) {
    state.score = 0;
    state.gameOver = false;
    state.won = false;
    state.wrongCount = 0;
    state.message = 'Guess a letter!';

    const board = world.getResource('board');
    board.target = pickWord(board.wordList);
    board.guessedLetters = {};

    const aiState = world.getResource('_aiState');
    aiState.possibleWords = [...board.wordList];
    aiState.phase = 'thinking';

    const timer = world.getResource('_aiTimer');
    timer.elapsed = 0;
  }
});

// ── Helper: Process a letter guess ──────────────────────────────────

function guessLetter(letter, board, state) {
  if (state.gameOver) return;
  if (board.guessedLetters[letter]) return;

  board.guessedLetters[letter] = true;

  if (board.target.indexOf(letter) >= 0) {
    // Correct guess
    state.message = 'Correct!';
    state.score += 10;

    // Check if word is fully revealed
    let allRevealed = true;
    for (let i = 0; i < board.target.length; i++) {
      if (!board.guessedLetters[board.target[i]]) {
        allRevealed = false;
        break;
      }
    }
    if (allRevealed) {
      state.gameOver = true;
      state.won = true;
      state.score += (MAX_WRONG - state.wrongCount) * 25;
      state.message = 'You win! The word was: ' + board.target.toUpperCase();
    }
  } else {
    // Wrong guess
    state.wrongCount++;
    state.message = 'Wrong! ' + (MAX_WRONG - state.wrongCount) + ' left';

    if (state.wrongCount >= MAX_WRONG) {
      state.gameOver = true;
      state.won = false;
      state.message = 'Game over! The word was: ' + board.target.toUpperCase();
    }
  }
}

// ── Player Input System ─────────────────────────────────────────────

game.system('playerInput', function playerInputSystem(world, _dt) {
  const gm = world.getResource('gameMode');
  if (!gm || gm.mode !== 'playerVsAi') return;

  const state = world.getResource('state');
  if (state.gameOver) return;

  const input = world.getResource('input');
  const board = world.getResource('board');
  const cursor = world.getResource('_cursor');

  // Navigate keyboard cursor
  const rowLen = KB_ROWS[cursor.row].length;

  if (consumeAction(input, 'left')) {
    cursor.col = Math.max(0, cursor.col - 1);
  }
  if (consumeAction(input, 'right')) {
    cursor.col = Math.min(KB_ROWS[cursor.row].length - 1, cursor.col + 1);
  }
  if (consumeAction(input, 'up')) {
    cursor.row = Math.max(0, cursor.row - 1);
    cursor.col = Math.min(cursor.col, KB_ROWS[cursor.row].length - 1);
  }
  if (consumeAction(input, 'down')) {
    cursor.row = Math.min(KB_ROWS.length - 1, cursor.row + 1);
    cursor.col = Math.min(cursor.col, KB_ROWS[cursor.row].length - 1);
  }

  // Select letter
  if (consumeAction(input, 'select')) {
    const letter = KB_ROWS[cursor.row][cursor.col];
    guessLetter(letter, board, state);
  }
});

// ── AI System ───────────────────────────────────────────────────────

const AI_THINK_DELAY = 400;
const AI_GUESS_DELAY = 200;

game.system('ai', function aiSystem(world, dt) {
  const gm = world.getResource('gameMode');
  if (gm && gm.mode === 'playerVsAi') return;

  const state = world.getResource('state');
  if (state.gameOver) return;

  const timer = world.getResource('_aiTimer');
  const aiState = world.getResource('_aiState');
  const board = world.getResource('board');

  timer.elapsed += dt;

  if (aiState.phase === 'thinking') {
    if (timer.elapsed < AI_THINK_DELAY) return;
    timer.elapsed = 0;

    // Filter possible words based on known correct/wrong letters
    aiState.possibleWords = aiState.possibleWords.filter(function (word) {
      // Word must contain all correctly guessed letters in the right pattern
      for (let i = 0; i < board.target.length; i++) {
        const ch = board.target[i];
        if (board.guessedLetters[ch]) {
          if (word.length <= i || word[i] !== ch) return false;
        }
      }
      // Word must not contain any wrong letters
      for (var letter in board.guessedLetters) {
        if (board.guessedLetters[letter] && board.target.indexOf(letter) < 0) {
          if (word.indexOf(letter) >= 0) return false;
        }
      }
      // Word length must match
      if (word.length !== board.target.length) return false;
      return true;
    });

    // Pick best letter by frequency in remaining possible words
    var letterScores = {};
    for (var i = 0; i < aiState.possibleWords.length; i++) {
      var word = aiState.possibleWords[i];
      var seen = {};
      for (var j = 0; j < word.length; j++) {
        var ch = word[j];
        if (!seen[ch] && !board.guessedLetters[ch]) {
          seen[ch] = true;
          letterScores[ch] = (letterScores[ch] || 0) + 1;
        }
      }
    }

    // Find best scoring letter, fallback to frequency order
    var bestLetter = null;
    var bestScore = -1;
    for (var letter in letterScores) {
      if (letterScores[letter] > bestScore) {
        bestScore = letterScores[letter];
        bestLetter = letter;
      }
    }

    // Fallback: use global frequency order
    if (!bestLetter) {
      for (var k = 0; k < LETTER_FREQ.length; k++) {
        if (!board.guessedLetters[LETTER_FREQ[k]]) {
          bestLetter = LETTER_FREQ[k];
          break;
        }
      }
    }

    if (bestLetter) {
      aiState.chosenLetter = bestLetter;
      aiState.phase = 'guessing';
      state.message = 'AI is thinking...';
    }
    return;
  }

  if (aiState.phase === 'guessing') {
    if (timer.elapsed < AI_GUESS_DELAY) return;
    timer.elapsed = 0;

    guessLetter(aiState.chosenLetter, board, state);
    aiState.phase = 'waiting';
    return;
  }

  if (aiState.phase === 'waiting') {
    if (timer.elapsed < AI_THINK_DELAY) return;
    timer.elapsed = 0;
    aiState.phase = 'thinking';
  }
});

// ── Draw Hangman Figure ─────────────────────────────────────────────

function drawHangmanFigure(ctx, cx, cy, wrongCount) {
  // Gallows
  ctx.strokeStyle = GALLOWS_COLOR;
  ctx.lineWidth = 3;

  // Base
  ctx.beginPath();
  ctx.moveTo(cx - 60, cy + 100);
  ctx.lineTo(cx + 60, cy + 100);
  ctx.stroke();

  // Vertical pole
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 100);
  ctx.lineTo(cx - 30, cy - 80);
  ctx.stroke();

  // Top beam
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy - 80);
  ctx.lineTo(cx + 20, cy - 80);
  ctx.stroke();

  // Rope
  ctx.beginPath();
  ctx.moveTo(cx + 20, cy - 80);
  ctx.lineTo(cx + 20, cy - 55);
  ctx.stroke();

  // Draw body parts based on wrong count
  ctx.strokeStyle = BODY_COLOR;
  ctx.lineWidth = 2;

  // 1: Head
  if (wrongCount >= 1) {
    drawCircle(ctx, cx + 20, cy - 40, 15, 'transparent', { strokeColor: BODY_COLOR, strokeWidth: 2 });
  }

  // 2: Body
  if (wrongCount >= 2) {
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy - 25);
    ctx.lineTo(cx + 20, cy + 25);
    ctx.stroke();
  }

  // 3: Left arm
  if (wrongCount >= 3) {
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy - 15);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.stroke();
  }

  // 4: Right arm
  if (wrongCount >= 4) {
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy - 15);
    ctx.lineTo(cx + 45, cy + 5);
    ctx.stroke();
  }

  // 5: Left leg
  if (wrongCount >= 5) {
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy + 25);
    ctx.lineTo(cx, cy + 60);
    ctx.stroke();
  }

  // 6: Right leg
  if (wrongCount >= 6) {
    ctx.beginPath();
    ctx.moveTo(cx + 20, cy + 25);
    ctx.lineTo(cx + 40, cy + 60);
    ctx.stroke();
  }
}

// ── Render System ───────────────────────────────────────────────────

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx } = renderer;
  const state = world.getResource('state');
  const board = world.getResource('board');
  const cursor = world.getResource('_cursor');

  clearCanvas(ctx, BG_COLOR);

  // ── Title ──
  drawLabel(ctx, 'HANGMAN', CANVAS_W / 2, 28, {
    color: TEXT_COLOR, fontSize: 24, align: 'center',
  });

  // ── Score ──
  drawLabel(ctx, 'Score: ' + state.score, CANVAS_W - 15, 20, {
    color: '#888', fontSize: 12, align: 'right',
  });

  // ── Hangman Figure ──
  drawHangmanFigure(ctx, 130, 170, state.wrongCount);

  // ── Word Blanks ──
  var blankY = 330;
  var blankW = 30;
  var blankGap = 8;
  var totalBlankW = board.target.length * (blankW + blankGap) - blankGap;
  var blankStartX = (CANVAS_W - totalBlankW) / 2;

  ctx.save();
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (var i = 0; i < board.target.length; i++) {
    var bx = blankStartX + i * (blankW + blankGap);
    var letter = board.target[i];
    var revealed = board.guessedLetters[letter];

    // Draw blank underline
    drawRoundedRect(ctx, bx, blankY, blankW, 36, 4, revealed ? ACCENT_COLOR : BLANK_COLOR);

    if (revealed) {
      ctx.fillStyle = CORRECT_COLOR;
      ctx.fillText(letter.toUpperCase(), bx + blankW / 2, blankY + 18);
    } else if (state.gameOver && !state.won) {
      // Reveal on loss
      ctx.fillStyle = WRONG_COLOR;
      ctx.fillText(letter.toUpperCase(), bx + blankW / 2, blankY + 18);
    }
  }
  ctx.restore();

  // ── On-screen Keyboard ──
  var gm = world.getResource('gameMode');
  var isPlayer = gm && gm.mode === 'playerVsAi';

  for (var r = 0; r < KB_ROWS.length; r++) {
    var row = KB_ROWS[r];
    var rowW = row.length * (KB_KEY_W + KB_GAP) - KB_GAP;
    var rowX = (CANVAS_W - rowW) / 2;
    var rowY = KB_Y + r * (KB_KEY_H + KB_GAP);

    for (var c = 0; c < row.length; c++) {
      var kx = rowX + c * (KB_KEY_W + KB_GAP);
      var ch = row[c];
      var guessed = board.guessedLetters[ch];
      var inWord = board.target.indexOf(ch) >= 0;

      // Key color
      var keyColor = ACCENT_COLOR;
      if (guessed && inWord) keyColor = '#2E7D32';
      else if (guessed && !inWord) keyColor = '#424242';

      drawRoundedRect(ctx, kx, rowY, KB_KEY_W, KB_KEY_H, 5, keyColor);

      // Cursor highlight
      if (isPlayer && !state.gameOver && r === cursor.row && c === cursor.col) {
        ctx.strokeStyle = '#42A5F5';
        ctx.lineWidth = 2;
        ctx.strokeRect(kx, rowY, KB_KEY_W, KB_KEY_H);
      }

      // Letter text
      ctx.save();
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = guessed ? '#666' : TEXT_COLOR;
      ctx.fillText(ch.toUpperCase(), kx + KB_KEY_W / 2, rowY + KB_KEY_H / 2);
      ctx.restore();
    }
  }

  // ── Wrong letters display ──
  var wrongLetters = [];
  for (var letter in board.guessedLetters) {
    if (board.guessedLetters[letter] && board.target.indexOf(letter) < 0) {
      wrongLetters.push(letter.toUpperCase());
    }
  }
  if (wrongLetters.length > 0) {
    drawLabel(ctx, 'Wrong: ' + wrongLetters.join(' '), CANVAS_W / 2, 380, {
      color: WRONG_COLOR, fontSize: 13, align: 'center',
    });
  }

  // ── Message ──
  drawLabel(ctx, state.message, CANVAS_W / 2, CANVAS_H - 30, {
    color: '#888', fontSize: 13, align: 'center',
  });

  // ── Controls hint ──
  if (!state.gameOver) {
    drawLabel(ctx, '\u2190\u2192\u2191\u2193 navigate  ENTER guess  R restart', CANVAS_W / 2, CANVAS_H - 10, {
      color: '#444', fontSize: 11, align: 'center',
    });
  }

  // ── Game Over overlay ──
  if (state.gameOver) {
    drawGameOver(ctx, 50, 80, CANVAS_W - 100, 260, {
      title: state.won ? 'YOU WIN!' : 'HANGED!',
      titleColor: state.won ? CORRECT_COLOR : WRONG_COLOR,
      subtitle: 'Score: ' + state.score + ' | Press R',
    });
  }

  drawTouchOverlay(ctx, ctx.canvas.width, ctx.canvas.height);
});

export default game;
