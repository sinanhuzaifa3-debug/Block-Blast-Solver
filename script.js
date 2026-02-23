// ----- CONFIGURATION CONSTANTS -----

const BOARD_SIZE = 8;
const BLOCK_GRID_SIZE = 5; // Block input grids are 5×5 for easier drawing
const NUM_BLOCKS = 3;

// Weights for heuristic scoring
const HEURISTIC_WEIGHTS = {
  emptyCell: 1, // reward per empty cell
  emptyRegionPenalty: 12, // penalty per disconnected empty region
  isolatedFilledPenalty: 6, // penalty per isolated filled cell
  columnHeightVariancePenalty: 1.8, // penalty per unit variance in column heights
  interiorHolePenalty: 15, // penalty per interior "hole" cell
  mixedClusterPenalty: 4 // penalty per 2x2 cluster with a single empty cell
};

// ----- DOM INITIALIZATION -----

document.addEventListener('DOMContentLoaded', () => {
  const mainBoardEl = document.getElementById('main-board');
  const blockEls = [
    document.getElementById('block-0'),
    document.getElementById('block-1'),
    document.getElementById('block-2')
  ];

  const clearBoardBtn = document.getElementById('clear-board-btn');
  const clearBlocksBtn = document.getElementById('clear-blocks-btn');
  const solveBtn = document.getElementById('solve-btn');

  const messageEl = document.getElementById('message');
  const instructionsEl = document.getElementById('instructions');

  // Internal state mirrors the UI
  const board = createEmptyMatrix(BOARD_SIZE, BOARD_SIZE);
  const blocks = [
    createEmptyMatrix(BLOCK_GRID_SIZE, BLOCK_GRID_SIZE),
    createEmptyMatrix(BLOCK_GRID_SIZE, BLOCK_GRID_SIZE),
    createEmptyMatrix(BLOCK_GRID_SIZE, BLOCK_GRID_SIZE)
  ];

  // Create board cells
  initGrid(mainBoardEl, BOARD_SIZE, BOARD_SIZE, (r, c, cellEl) => {
    cellEl.addEventListener('click', () => {
      const newVal = board[r][c] ? 0 : 1;
      board[r][c] = newVal;
      cellEl.classList.toggle('filled', !!newVal);
      clearGhostHighlights(mainBoardEl);
      clearOutput(messageEl, instructionsEl);
    });
  });

  // Create block grids (5×5 for easier drawing)
  blockEls.forEach((blockEl, idx) => {
    initGrid(blockEl, BLOCK_GRID_SIZE, BLOCK_GRID_SIZE, (r, c, cellEl) => {
      // Add block-specific class for color styling
      cellEl.classList.add('block-' + idx);
      cellEl.addEventListener('click', () => {
        const newVal = blocks[idx][r][c] ? 0 : 1;
        blocks[idx][r][c] = newVal;
        cellEl.classList.toggle('filled', !!newVal);
        clearGhostHighlights(mainBoardEl);
        clearOutput(messageEl, instructionsEl);
      });
    });
  });

  // Button handlers
  clearBoardBtn.addEventListener('click', () => {
    fillMatrix(board, 0);
    syncMatrixToGrid(board, mainBoardEl);
    clearGhostHighlights(mainBoardEl);
    clearOutput(messageEl, instructionsEl);
  });

  clearBlocksBtn.addEventListener('click', () => {
    blocks.forEach((b, idx) => {
      fillMatrix(b, 0);
      syncBlockMatrixToGrid(b, blockEls[idx], idx);
    });
    clearGhostHighlights(mainBoardEl);
    clearOutput(messageEl, instructionsEl);
  });

  solveBtn.addEventListener('click', () => {
    clearGhostHighlights(mainBoardEl);
    clearOutput(messageEl, instructionsEl);

    const simpleBlocks = blocks.map(extractBlockShape);

    // Validate that each block has at least one filled cell
    for (let i = 0; i < NUM_BLOCKS; i++) {
      if (!simpleBlocks[i]) {
        setMessage(
          messageEl,
          `Block ${i + 1} must have at least one filled cell.`,
          true
        );
        return;
      }
    }

    const result = findBestMoveSequence(board, simpleBlocks);

    if (!result) {
      setMessage(
        messageEl,
        'No valid placement exists for all three blocks. This board state is a dead end.',
        true
      );
      return;
    }

    setMessage(
      messageEl,
      `Found a recommended sequence (score ${result.score.toFixed(1)}).`,
      false
    );
    renderInstructions(result, instructionsEl);
    visualizeSequence(result, mainBoardEl);
  });
});

// ----- UI HELPERS -----

/**
 * Initialize a grid container with clickable cell divs.
 */
function initGrid(container, rows, cols, onCreateCell) {
  container.innerHTML = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      onCreateCell(r, c, cell);
      container.appendChild(cell);
    }
  }
}

/**
 * Sync a 0/1 matrix to a grid's filled classes.
 */
function syncMatrixToGrid(matrix, container) {
  const cells = container.querySelectorAll('.cell');
  cells.forEach((cell) => {
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    cell.classList.toggle('filled', !!matrix[r][c]);
    cell.classList.remove('ghost-0', 'ghost-1', 'ghost-2');
  });
}

/**
 * Sync a block matrix to its grid with block-specific color class.
 */
function syncBlockMatrixToGrid(matrix, container, blockIndex) {
  const cells = container.querySelectorAll('.cell');
  cells.forEach((cell) => {
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    cell.classList.toggle('filled', !!matrix[r][c]);
    // Ensure block-specific class is present
    if (!cell.classList.contains('block-' + blockIndex)) {
      cell.classList.add('block-' + blockIndex);
    }
  });
}

function clearGhostHighlights(boardEl) {
  boardEl
    .querySelectorAll('.cell.ghost-0, .cell.ghost-1, .cell.ghost-2')
    .forEach((cell) => {
      cell.classList.remove('ghost-0', 'ghost-1', 'ghost-2');
    });
}

function clearOutput(messageEl, instructionsEl) {
  messageEl.textContent = '';
  messageEl.className = 'message';
  instructionsEl.innerHTML = '';
}

function setMessage(el, text, isError) {
  el.textContent = text;
  el.className = 'message ' + (isError ? 'error' : 'success');
}

/**
 * Visualize recommended sequence using ghost highlight classes.
 * Highlights are shown sequentially with a brief delay.
 */
function visualizeSequence(result, boardEl) {
  const cells = boardEl.querySelectorAll('.cell');

  // Helper to get cell element for (r, c)
  const getCell = (r, c) =>
    Array.from(cells).find(
      (cell) => Number(cell.dataset.row) === r && Number(cell.dataset.col) === c
    );

  const delayPerStep = 450;

  result.moves.forEach((move, step) => {
    const className = 'ghost-' + move.displayBlockIndex;
    setTimeout(() => {
      move.absoluteCells.forEach(([r, c]) => {
        const cell = getCell(r, c);
        if (cell) {
          cell.classList.add(className);
        }
      });
    }, step * delayPerStep);
  });
}

/**
 * Render textual instructions describing the placement order.
 */
function renderInstructions(result, listEl) {
  listEl.innerHTML = '';
  result.moves.forEach((move, idx) => {
    const li = document.createElement('li');
    const row = move.topLeftRow + 1;
    const col = move.topLeftCol + 1;
    li.textContent = `Block ${move.displayBlockIndex + 1} → place with its top-left tile at board row ${row}, column ${col}.`;
    listEl.appendChild(li);
  });
}

// ----- MATRIX UTILITIES -----

function createEmptyMatrix(rows, cols) {
  const m = new Array(rows);
  for (let r = 0; r < rows; r++) {
    m[r] = new Array(cols).fill(0);
  }
  return m;
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function fillMatrix(matrix, value) {
  for (let r = 0; r < matrix.length; r++) {
    matrix[r].fill(value);
  }
}

// ----- BLOCK SHAPE EXTRACTION -----

/**
 * Convert a block matrix (5×5 or any size) into a compact shape:
 * { cells: [[dr, dc], ...], height, width }
 * Returns null if the block is empty.
 */
function extractBlockShape(matrix) {
  let minR = Infinity;
  let maxR = -1;
  let minC = Infinity;
  let maxC = -1;

  const rows = matrix.length;
  const cols = matrix[0] ? matrix[0].length : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }

  if (maxR === -1) {
    return null;
  }

  const height = maxR - minR + 1;
  const width = maxC - minC + 1;
  const cells = [];

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (matrix[r][c]) {
        cells.push([r - minR, c - minC]);
      }
    }
  }

  return { cells, height, width };
}

// ----- PLACEMENT + SIMULATION -----

/**
 * Check if a block can be placed on board at (row, col) without overlap
 * and staying inside bounds.
 */
function canPlaceBlock(board, blockShape, row, col) {
  if (row < 0 || col < 0) return false;
  if (row + blockShape.height > BOARD_SIZE) return false;
  if (col + blockShape.width > BOARD_SIZE) return false;

  for (const [dr, dc] of blockShape.cells) {
    const r = row + dr;
    const c = col + dc;
    if (board[r][c]) {
      return false;
    }
  }
  return true;
}

/**
 * Place a block on a cloned board, apply line clears, and return:
 * { board: newBoard, linesCleared, clearedRows, clearedCols }
 */
function placeBlockAndClearLines(board, blockShape, row, col) {
  const newBoard = cloneMatrix(board);
  for (const [dr, dc] of blockShape.cells) {
    const r = row + dr;
    const c = col + dc;
    newBoard[r][c] = 1;
  }

  // Find full rows and columns
  const rowsToClear = [];
  const colsToClear = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    let fullRow = true;
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!newBoard[r][c]) {
        fullRow = false;
        break;
      }
    }
    if (fullRow) rowsToClear.push(r);
  }

  for (let c = 0; c < BOARD_SIZE; c++) {
    let fullCol = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (!newBoard[r][c]) {
        fullCol = false;
        break;
      }
    }
    if (fullCol) colsToClear.push(c);
  }

  // Clear them simultaneously
  for (const r of rowsToClear) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      newBoard[r][c] = 0;
    }
  }

  for (const c of colsToClear) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      newBoard[r][c] = 0;
    }
  }

  const linesCleared = rowsToClear.length + colsToClear.length;

  return {
    board: newBoard,
    linesCleared,
    clearedRows: rowsToClear,
    clearedCols: colsToClear
  };
}

/**
 * Compute the immediate score contribution from line clears for a single move.
 * +100 per cleared line, +50 bonus if multiple lines cleared in this move.
 */
function scoreLineClears(linesCleared) {
  if (linesCleared === 0) return 0;
  let score = linesCleared * 100;
  if (linesCleared > 1) {
    score += 50;
  }
  return score;
}

// ----- HEURISTIC EVALUATION -----

/**
 * Evaluate a board with a heuristic that balances:
 * - Empty space and fragmentation
 * - Surface flatness and compactness
 * - Future risk (interior holes, awkward clusters)
 */
function evaluateBoard(board) {
  const size = BOARD_SIZE;

  // 1. Empty space and regions
  let emptyCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!board[r][c]) emptyCount++;
    }
  }

  const emptyRegions = countEmptyRegions(board);

  // 2. Surface flatness and isolated cells
  const { isolatedFilledCount, columnHeights } = analyzeSurface(board);
  const variance = computeVariance(columnHeights);

  // 3. Future risk via interior holes and mixed clusters
  const interiorHoles = countInteriorHoles(board);
  const mixedClusters = countMixed2x2Clusters(board);

  let score = 0;

  // Reward more empty cells
  score += emptyCount * HEURISTIC_WEIGHTS.emptyCell;

  // Penalize fragmented empty regions
  score -= emptyRegions * HEURISTIC_WEIGHTS.emptyRegionPenalty;

  // Penalize isolated filled tiles (jaggedness)
  score -= isolatedFilledCount * HEURISTIC_WEIGHTS.isolatedFilledPenalty;

  // Penalize column height variance (less flat)
  score -= variance * HEURISTIC_WEIGHTS.columnHeightVariancePenalty;

  // Penalize unreachable interior holes
  score -= interiorHoles * HEURISTIC_WEIGHTS.interiorHolePenalty;

  // Penalize awkward 2x2 near-complete blocks
  score -= mixedClusters * HEURISTIC_WEIGHTS.mixedClusterPenalty;

  return score;
}

function countEmptyRegions(board) {
  const size = BOARD_SIZE;
  const visited = createEmptyMatrix(size, size);
  let regions = 0;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!board[r][c] && !visited[r][c]) {
        regions++;
        const stack = [[r, c]];
        visited[r][c] = 1;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          for (const [dr, dc] of dirs) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (
              nr >= 0 &&
              nr < size &&
              nc >= 0 &&
              nc < size &&
              !board[nr][nc] &&
              !visited[nr][nc]
            ) {
              visited[nr][nc] = 1;
              stack.push([nr, nc]);
            }
          }
        }
      }
    }
  }

  return regions;
}

function analyzeSurface(board) {
  const size = BOARD_SIZE;
  const columnHeights = new Array(size).fill(0);
  let isolatedFilledCount = 0;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let c = 0; c < size; c++) {
    let height = 0;
    for (let r = 0; r < size; r++) {
      if (board[r][c]) {
        height = size - r;
        break;
      }
    }
    columnHeights[c] = height;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!board[r][c]) continue;
      let neighbors = 0;
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc]) {
          neighbors++;
        }
      }
      if (neighbors === 0) {
        isolatedFilledCount++;
      }
    }
  }

  return { isolatedFilledCount, columnHeights };
}

function computeVariance(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((sum, v) => sum + v, 0) / arr.length;
  let variance = 0;
  for (const v of arr) {
    const diff = v - mean;
    variance += diff * diff;
  }
  return variance / arr.length;
}

function countInteriorHoles(board) {
  const size = BOARD_SIZE;
  let holes = 0;

  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (board[r][c]) continue;
      // Check if 4-neighbors are all filled
      if (
        board[r - 1][c] &&
        board[r + 1][c] &&
        board[r][c - 1] &&
        board[r][c + 1]
      ) {
        holes++;
      }
    }
  }

  return holes;
}

function countMixed2x2Clusters(board) {
  const size = BOARD_SIZE;
  let count = 0;
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const cells = [
        board[r][c],
        board[r][c + 1],
        board[r + 1][c],
        board[r + 1][c + 1]
      ];
      const ones = cells.filter(Boolean).length;
      // Penalize blocks that are almost complete but with one awkward hole
      if (ones === 3) {
        count++;
      }
    }
  }
  return count;
}

// ----- SEARCH OVER ALL PERMUTATIONS -----

/**
 * Find the best sequence of placements for the 3 blocks.
 * Considers all permutations and all valid placements per step.
 *
 * Returns:
 * {
 *   score,
 *   moves: [
 *     { displayBlockIndex, topLeftRow, topLeftCol, absoluteCells }
 *   ]
 * }
 * or null if no full placement sequence exists.
 */
function findBestMoveSequence(board, blockShapes) {
  const permutations = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0]
  ];

  let bestResult = null;

  for (const perm of permutations) {
    const result = searchOrder(board, blockShapes, perm);
    if (result && (!bestResult || result.score > bestResult.score)) {
      bestResult = result;
    }
  }

  return bestResult;
}

/**
 * Explore all placements for a fixed block order.
 */
function searchOrder(initialBoard, blockShapes, order) {
  let best = null;

  function dfs(stepIndex, currentBoard, accumulatedLineScore, moves) {
    if (stepIndex === NUM_BLOCKS) {
      // All 3 blocks placed, evaluate final board
      const heuristicScore = evaluateBoard(currentBoard);
      const totalScore = accumulatedLineScore + heuristicScore;
      if (!best || totalScore > best.score) {
        best = { score: totalScore, moves: moves.map((m) => ({ ...m })) };
      }
      return;
    }

    const blockIdx = order[stepIndex];
    const blockShape = blockShapes[blockIdx];
    let anyPlacement = false;

    for (let r = 0; r <= BOARD_SIZE - blockShape.height; r++) {
      for (let c = 0; c <= BOARD_SIZE - blockShape.width; c++) {
        if (!canPlaceBlock(currentBoard, blockShape, r, c)) continue;
        anyPlacement = true;

        const { board: nextBoard, linesCleared } = placeBlockAndClearLines(
          currentBoard,
          blockShape,
          r,
          c
        );

        const lineScore = scoreLineClears(linesCleared);

        // Track absolute cells used for visualization
        const absCells = blockShape.cells.map(([dr, dc]) => [r + dr, c + dc]);

        moves.push({
          displayBlockIndex: blockIdx,
          topLeftRow: r,
          topLeftCol: c,
          absoluteCells: absCells
        });

        dfs(stepIndex + 1, nextBoard, accumulatedLineScore + lineScore, moves);

        moves.pop();
      }
    }

    // If no placement is possible for this block at this step, this order path is invalid
    if (!anyPlacement) return;
  }

  dfs(0, cloneMatrix(initialBoard), 0, []);
  return best;
}

// ----- EXPLANATION (for reference in comments) -----
// Solver overview:
// - The current 8×8 board and each block's 8×8 mini-grid are captured as 0/1 matrices.
// - For each block mini-grid we extract a tight bounding box of filled cells to form a shape.
// - We then simulate every permutation of block ordering (3! = 6).
// - For each order, we recursively try every valid top-left placement for the block at that step:
//   * If it fits and does not overlap, we place it, clear full rows and columns simultaneously,
//     and compute an immediate line-clear score (+100 per line, +50 if the move clears >1 line).
//   * After placing all 3 blocks in a path, we evaluate the resulting board using the heuristic
//     (empty space, fragmentation, flatness, and future risk) and add that to the accumulated
//     line-clear score to get a final score for the sequence.
// - The highest-scoring full 3-block sequence across all permutations and placements is chosen.
// - The UI then:
//   * Highlights the recommended placements in order with ghost colors on the main board.
//   * Displays text instructions: "Block N → top-left at row R, column C".
//
// Heuristic notes:
// - Favors more empty cells while discouraging many tiny disconnected cavities (empty-region count).
// - Discourages isolated filled tiles and jagged column profiles (column height variance).
// - Penalizes "interior holes" that are fully surrounded by filled tiles and near-complete 2×2
//   clusters with a single gap, which often block larger pieces and reduce survivability.

