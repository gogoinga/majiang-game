<template>
  <div class="lobby-shell">
    <div class="lobby-shell__inner">
      <section class="lobby-hero">
        <div class="lobby-hero__copy">
          <div class="lobby-kicker">
            MAJIANG LOBBY
          </div>
          <h1 class="lobby-title">
            房间大厅
          </h1>
          <p class="lobby-description">
            先创建房间，再让其他玩家在这里挑选同一个房间进入。房间没人后会自动释放，下一次新建房间会重新开始计分。
          </p>
        </div>
        <div class="lobby-hero__badge">
          横屏大厅
        </div>
      </section>

      <section class="lobby-actions">
        <input
          v-model.trim="manualRoomId"
          maxlength="16"
          placeholder="输入 roomId 快速进入"
          aria-label="手动输入房间 ID"
          class="lobby-room-input"
          @keydown.enter="enterManualRoom"
        />
        <button
          @click="enterManualRoom"
          class="lobby-action-button lobby-action-button--ghost"
        >
          进入房间
        </button>
        <button
          @click="handleCreateRoom"
          class="lobby-action-button lobby-action-button--primary"
        >
          创建房间
        </button>
      </section>

      <div class="lobby-section-head">
        <div class="lobby-section-title">
          可加入房间
        </div>
        <button
          @click="requestRoomList"
          class="lobby-refresh-button"
        >
          刷新列表
        </button>
      </div>

      <div class="lobby-room-area">
        <div
          v-if="rooms.length === 0"
          class="lobby-empty"
        >
          <div class="lobby-empty__title">
            还没有房间
          </div>
          <div class="lobby-empty__text">
            点右上角“创建房间”就可以开一桌了。
          </div>
        </div>

        <div
          v-else
          class="lobby-room-grid"
        >
          <div
            v-for="room in rooms"
            :key="room.roomId"
            class="room-card"
          >
            <div class="room-card__top">
              <div class="room-card__id-block">
                <div class="room-card__eyebrow">
                  ROOM ID
                </div>
                <div class="room-card__id">
                  {{ room.roomId }}
                </div>
              </div>
              <div
                class="room-card__status"
                :class="
                  room.inGame
                    ? 'room-card__status--in-game'
                    : 'room-card__status--waiting'
                "
              >
                {{ room.inGame ? "对局中" : "待开始" }}
              </div>
            </div>

            <div class="room-card__stats">
              <div class="room-card__stat">
                <div class="room-card__stat-label">
                  在线
                </div>
                <div class="room-card__stat-value">
                  {{ room.playerCount }}/4
                </div>
              </div>
              <div class="room-card__stat">
                <div class="room-card__stat-label">
                  已准备
                </div>
                <div class="room-card__stat-value">
                  {{ room.readyCount }}/4
                </div>
              </div>
            </div>

            <button
              @click="enterRoom(room.roomId)"
              :disabled="room.playerCount >= 4"
              :aria-label="
                room.playerCount >= 4
                  ? `房间 ${room.roomId} 已满`
                  : `进入房间 ${room.roomId}`
              "
              class="room-card__enter"
            >
              {{ room.playerCount >= 4 ? "房间已满" : "进入牌局" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSocket } from "@/hooks/useSocket";

type RoomSummary = {
  roomId: string;
  playerCount: number;
  readyCount: number;
  inGame: boolean;
};

const router = useRouter();
const { connect, on, off, send } = useSocket();

const rooms = ref<RoomSummary[]>([]);
const manualRoomId = ref("");

const handleRoomList = (list: RoomSummary[]) => {
  rooms.value = list;
};

const handleRoomCreated = ({ roomId }: { roomId: string }) => {
  enterRoom(roomId);
};

const requestRoomList = () => {
  send("requestRoomList");
};

const enterRoom = (roomId: string) => {
  router.push(`/room/${roomId}`);
};

const enterManualRoom = () => {
  const roomId = manualRoomId.value.trim();
  if (!roomId) return;
  enterRoom(roomId);
};

const handleCreateRoom = () => {
  send("createRoom");
};

onMounted(() => {
  connect();

  on("roomList", handleRoomList);
  on("roomCreated", handleRoomCreated);

  requestRoomList();
});

onUnmounted(() => {
  off("roomList", handleRoomList);
  off("roomCreated", handleRoomCreated);
});
</script>

<style scoped>
.lobby-shell {
  min-height: 100dvh;
  overflow: hidden;
  padding:
    calc(var(--app-shell-padding) + var(--app-safe-area-top))
    calc(var(--app-shell-padding) + var(--app-safe-area-right))
    calc(var(--app-shell-padding) + var(--app-safe-area-bottom))
    calc(var(--app-shell-padding) + var(--app-safe-area-left));
  color: #fff;
  background:
    radial-gradient(circle at top, rgba(15, 95, 53, 0.96) 0%, rgba(10, 58, 33, 0.95) 45%, rgba(7, 39, 22, 0.98) 100%);
}

.lobby-shell__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-compact-gap);
  width: min(100%, 72rem);
  min-height: calc(
    100dvh - (var(--app-shell-padding) * 2) - var(--app-safe-area-block)
  );
  overflow: hidden;
  margin: 0 auto;
}

.lobby-hero,
.lobby-actions,
.lobby-section-head,
.lobby-room-area {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--app-panel-radius);
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 1.25rem 3.75rem rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(14px);
}

.lobby-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 7rem;
  padding: 1rem 1.25rem;
}

.lobby-hero__copy {
  min-width: 0;
}

.lobby-kicker {
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.34em;
  color: rgba(236, 253, 245, 0.7);
}

.lobby-title {
  margin-top: 0.45rem;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: 0.04em;
}

.lobby-description {
  max-width: 42rem;
  margin-top: 0.5rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: rgba(236, 253, 245, 0.76);
}

.lobby-hero__badge {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 0.6rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.12em;
  color: #032012;
  background: rgba(245, 200, 75, 0.96);
}

.lobby-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 4rem;
  padding: 0.8rem;
}

.lobby-room-input {
  flex: 1 1 14rem;
  min-width: 0;
  height: var(--app-control-height);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 1rem;
  padding: 0 1rem;
  font-size: 0.95rem;
  color: #fff;
  outline: none;
  background: rgba(255, 255, 255, 0.08);
}

.lobby-room-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.lobby-room-input:focus {
  border-color: rgba(167, 243, 208, 0.95);
}

.lobby-action-button,
.lobby-refresh-button,
.room-card__enter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  line-height: 1;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.lobby-action-button {
  flex: 0 0 auto;
  min-width: 5.5rem;
  height: var(--app-control-height);
  border-radius: 1rem;
  padding: 0 1rem;
  font-size: 0.95rem;
  font-weight: 800;
}

.lobby-action-button--ghost {
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.lobby-action-button--ghost:hover {
  background: rgba(255, 255, 255, 0.14);
}

.lobby-action-button--primary {
  border: 0;
  color: #032012;
  background: #f5c84b;
}

.lobby-action-button--primary:hover {
  background: #ffd15c;
}

.lobby-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 3.4rem;
  padding: 0.75rem 1rem;
}

.lobby-section-title {
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.24em;
  color: rgba(236, 253, 245, 0.72);
}

.lobby-refresh-button {
  flex: 0 0 auto;
  min-height: 2.25rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 0 0.9rem;
  font-size: 0.78rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
}

.lobby-refresh-button:hover {
  background: rgba(255, 255, 255, 0.14);
}

.lobby-room-area {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0.9rem;
  overflow-y: auto;
}

.lobby-empty {
  min-height: 100%;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 1.5rem;
  padding: 3rem 1.5rem;
  text-align: center;
  background: rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.lobby-empty__title {
  font-size: 1.45rem;
  font-weight: 900;
  color: rgba(236, 253, 245, 0.98);
}

.lobby-empty__text {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
}

.lobby-room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.75rem;
  align-content: start;
}

.room-card {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1.5rem;
  padding: 0.95rem;
  background: rgba(0, 0, 0, 0.16);
  box-shadow: 0 1rem 2.75rem rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(14px);
}

.room-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.room-card__id-block {
  min-width: 0;
}

.room-card__eyebrow {
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.28em;
  color: rgba(236, 253, 245, 0.6);
}

.room-card__id {
  margin-top: 0.35rem;
  font-size: 1.25rem;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: 0.05em;
  color: #fff;
  word-break: break-all;
}

.room-card__status {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 0.45rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.14em;
}

.room-card__status--in-game {
  color: #032012;
  background: #f5c84b;
}

.room-card__status--waiting {
  color: #032012;
  background: #86efac;
}

.room-card__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin-top: 0.8rem;
}

.room-card__stat {
  border-radius: 1rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.08);
}

.room-card__stat-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
}

.room-card__stat-value {
  margin-top: 0.18rem;
  font-size: 1.15rem;
  font-weight: 900;
  line-height: 1;
  color: #fff;
}

.room-card__enter {
  width: 100%;
  height: var(--app-control-height);
  margin-top: 0.8rem;
  border: 0;
  border-radius: 1rem;
  padding: 0 1rem;
  font-size: 0.95rem;
  font-weight: 900;
  color: #032012;
  background: #7dd3fc;
}

.room-card__enter:hover:not(:disabled) {
  background: #bae6fd;
}

.room-card__enter:disabled {
  cursor: not-allowed;
  color: rgba(255, 255, 255, 0.6);
  background: #475569;
}

@media (max-width: 54rem) {
  .lobby-hero {
    align-items: flex-start;
  }

  .lobby-title {
    font-size: 1.75rem;
  }
}

@media (max-width: 47rem) {
  .lobby-actions {
    flex-wrap: wrap;
  }

  .lobby-room-input {
    flex-basis: 100%;
  }

  .lobby-action-button {
    flex: 1 1 0;
    min-width: 0;
  }

  .lobby-room-grid {
    grid-template-columns: 1fr;
  }
}
</style>
