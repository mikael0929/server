// server/gameState.js
const roles = ["a", "b", "c", "d", "e", "f"];

function initGameState() {
  return {
    mazeIndex: 0,
    players: [],
    playerPosition: { x: 1, y: 1 },
    exitPosition: { x: 3, y: 3 } // 예시 출구 (미로마다 바뀔 수 있음)
  };
}

function findExitInMaze(maze) {
  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      if (maze[y][x] === 2) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 }; // 기본값
}

function findStartInMaze(maze) {
  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      if (maze[y][x] === "s") {
        maze[y][x] = 0; // ✅ 지나갈 수 있게 바꿔줌
        return { x, y };
      }
    }
  }
  return { x: 1, y: 1 }; // 기본값 (없을 경우)
}

function findYStartInMaze(maze) {
  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      if (maze[y][x] === "y") {
        maze[y][x] = 0; // 길로 바꿔줌
        return { x, y };
      }
    }
  }
  return null;
}

function assignRole(socketId, state) {
  const takenRoles = state.players.map((p) => p.role);
  const availableRoles = roles.filter((r) => !takenRoles.includes(r));
  const role = availableRoles[0] || "spectator";

  state.players.push({ id: socketId, role });
  return role;
}

function updatePlayerPosition(state, role, direction) {
  const pos = state.playerPosition;
  const maze = state.maze;

  let newX = pos.x;
  let newY = pos.y;

  // 역할에 따라 이동 방향 계산
  if (role === "b" && direction === "left") newX--;
  if (role === "c" && direction === "right") newX++;
  if (role === "d" && direction === "down") newY++;
  if (role === "e" && direction === "up") newY--;
  if (role === "f" && direction === "jump") newY -= 2;

  // 좌표 유효성 검사
  const isValid =
  newY >= 0 &&
  newY < maze.length &&
  newX >= 0 &&
  newX < maze[0].length &&
  (maze[newY][newX] === 0 || maze[newY][newX] === 2); // ✅ 출구도 이동 가능

  // 이동 가능한 경우만 위치 갱신
  if (isValid) {
    pos.x = newX;
    pos.y = newY;
  }
  console.log(`role=${role}, direction=${direction}, newX=${newX}, newY=${newY}`);
  console.log("isValid:", isValid);

  return pos;
}

module.exports = {
  initGameState,
  assignRole,
  updatePlayerPosition,
  findExitInMaze,
  findStartInMaze,
  findYStartInMaze,
};