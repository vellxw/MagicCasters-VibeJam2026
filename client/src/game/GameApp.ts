import * as THREE from 'three';
import {
  clearAutoCollisionWalls,
  countAutoCollisionWalls
} from '../../../shared/autoCollisionWalls';
import { SPELL_IDS, type SpellId } from '../../../shared/spells';
import {
  findClimbableWall,
  findStandingSurfaceY,
  moveWithArenaCollision,
  resolveArenaVerticalCollision
} from '../../../shared/arenaCollision';
import {
  DEFAULT_ARENA_ID,
  PLAYER_CLIMB_SPEED,
  PLAYER_GRAVITY,
  PLAYER_JUMP_VELOCITY,
  SPLAT_TEST_ARENA_ID,
  type ArenaId,
  type MatchMode,
  type MoveInput
} from '../../../shared/types';
import type { SplatQuality } from '../../../shared/splatMapPool';
import { FirstPersonCamera, clampPitch } from '../camera/FirstPersonCamera';
import { TouchControls } from '../input/TouchControls';
import { NetworkClient } from '../network/NetworkClient';
import { applyPredictedHorizontalMovement, needsReconciliation } from '../network/PredictedMovement';
import { LocalPlayerController, type PlayerSnapshot } from '../player/LocalPlayerController';
import { RemotePlayerController } from '../player/RemotePlayerController';
import { AnimatedPlayerController, cloneCharacterScene, preloadCharacterGltf } from '../player/AnimatedPlayerController';
import { SpellVfxManager } from '../spells/SpellVfxManager';
import { CharacterSelectOverlay } from '../ui/CharacterSelectOverlay';
import { DebugOverlay } from '../ui/DebugOverlay';
import { QualityPicker } from '../ui/QualityPicker';
import { QualitySettingsModal } from '../ui/QualitySettingsModal';
import { SplatCalibrationOverlay } from '../ui/SplatCalibrationOverlay';
import { resolveEffectiveTier, saveGraphicsTier, tierToSplatQuality, splatQualityToTier, type GraphicsTier } from '../utils/GraphicsSettings';
import { VoiceCommandManager } from '../voice/VoiceCommandManager';
import { createArenaProvider, type ArenaDebugInfo, type ArenaRuntime } from '../world/ArenaProvider';
import {
  applyCalibrationToPreset,
  calibrationSettingsFromPreset,
  clearConfiguredSplatArenaPreset,
  loadLatestSplatPresetBackupEntry,
  loadLatestSplatPresetHistoryEntry,
  loadConfiguredSplatArenaPreset,
  saveConfiguredSplatArenaPreset,
  getSplatCalibrationStorageKey,
  setStoredSplatPresetId,
  setStoredSplatQuality,
  splatPresetIsCompatibleWithBase,
  type SplatMapCatalog,
  type SplatArenaPreset,
  type SplatPresetHistoryEntry,
  type SplatCalibrationSettings
} from '../world/ArenaPreset';
import { LobbyScene } from '../world/LobbyScene';
import { type CharacterClass, isCharacterClass } from '../../../shared/classes';
import {
  requestDevSplatCollisionDeletion,
  requestDevSplatCollisionGeneration,
  requestDevSplatMapPublish
} from '../world/AutoCollisionGenerator';

interface ProjectileSnapshot {
  id: string;
  spellId: SpellId;
  x: number;
  y: number;
  z: number;
}

type SceneMode = 'LOBBY' | 'CHARACTER_SELECT' | 'QUEUE' | 'MATCH' | 'RESULTS' | 'CALIBRATION';
type CharacterGltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
type PlayerController = LocalPlayerController | RemotePlayerController | AnimatedPlayerController;

export class GameApp {
  private shell: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 120);
  private clock = new THREE.Clock();
  private cameraRig = new FirstPersonCamera();
  private vfx = new SpellVfxManager(this.scene);
  private touchControls: TouchControls;
  private ui: DebugOverlay;
  private calibrationUi: SplatCalibrationOverlay;
  private characterSelectUi: CharacterSelectOverlay;
  private mobileStartEl: HTMLDivElement;
  private voice = new VoiceCommandManager();
  private network: NetworkClient;
  private lobby: LobbyScene | null = null;
  private arenaRuntime: ArenaRuntime | null = null;
  private calibrationController: LocalPlayerController | null = null;
  private splatCatalog: SplatMapCatalog | null = null;
  private calibrationBasePreset: SplatArenaPreset | null = null;
  private calibrationPreset: SplatArenaPreset | null = null;
  private calibrationSettings: SplatCalibrationSettings | null = null;
  private calibrationSnapshot: PlayerSnapshot | null = null;
  private calibrationGuide: THREE.Group | null = null;
  private calibrationVelocityY = 0;
  private players = new Map<string, PlayerController>();
  private playerSnapshots = new Map<string, PlayerSnapshot>();
  private projectileSnapshots: ProjectileSnapshot[] = [];
  private keys = new Set<string>();
  private jumpQueued = false;
  private lastJumpActionAt = 0;
  private dashQueued = false;
  private dashQueuedAt = 0;
  private localName = `Mage ${Math.floor(Math.random() * 900 + 100)}`;
  private aimYaw = 0;
  private aimPitch = 0;
  private sceneMode: SceneMode = 'LOBBY';
  private selectedMode: MatchMode | null = null;
  private selectedArenaId: ArenaId = DEFAULT_ARENA_ID;
  private selectedArenaPresetId = '';
  private selectedArenaPresetUrl = '';
  private selectedArenaDisplayName = '';
  private selectedSplatQuality: SplatQuality = tierToSplatQuality(resolveEffectiveTier());
  private selectedCharacterClass: CharacterClass = 'arcanist';
  private phase = 'WAITING';
  private phaseMessage = '';
  private winnerId = '';
  private localControllerId: string | null = null;
  private localPlayerBound = false;
  private controlsEnabled = false;
  private lastMoveSent = 0;
  private queueToken = 0;
  private animationId = 0;
  private previewGroup: THREE.Group | null = null;
  private previewMixer: THREE.AnimationMixer | null = null;
  private previewActions = new Map<string, THREE.AnimationAction>();
  private previewRotY = 0;
  private previewAutoRotate = true;
  private previewDrag = false;
  private previewLastX = 0;
  private previewToken = 0;
  private gltfCache = new Map<CharacterClass, CharacterGltf>();
  private gltfLoads = new Map<CharacterClass, Promise<CharacterGltf | null>>();
  private qualityPicker: QualityPicker | null = null;
  private qualityModal: QualitySettingsModal | null = null;
  private initialQualitySelected = false;

  constructor(private root: HTMLElement) {
    this.shell = document.createElement('div');
    this.shell.className = 'game-shell';
    this.root.appendChild(this.shell);

    const tier = resolveEffectiveTier();
    this.renderer = new THREE.WebGLRenderer({ antialias: tier !== 'low', alpha: true, powerPreference: tier === 'low' ? 'low-power' : 'high-performance' });
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'low' ? 0.75 : tier === 'medium' ? 1.0 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = tier !== 'low';
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.setClearColor(0x15120f);
    this.shell.appendChild(this.renderer.domElement);

    this.touchControls = new TouchControls(this.shell);
    this.ui = new DebugOverlay(this.root);
    this.calibrationUi = new SplatCalibrationOverlay(this.root);
    this.characterSelectUi = new CharacterSelectOverlay(this.root);
    this.mobileStartEl = this.createMobileStartOverlay();
    this.createPortraitBlocker();
    this.network = new NetworkClient(resolveServerUrl());

    this.characterSelectUi.onBack = () => this.returnToLobby();
    this.characterSelectUi.onClassSelect = (characterClass) => this.switchPreviewClass(characterClass);
    this.characterSelectUi.onConfirm = (characterClass) => this.confirmCharacterSelection(characterClass);
    this.characterSelectUi.onSpellHover = (spellId) => this.playPreviewAnim(spellId ? 'lanzarmagia' : 'reposo');
    this.bindCharacterPreviewEvents();
  }

  start(): void {
    this.setupScene();
    this.bindEvents();
    void this.preloadCharacterModels();
    if (new URLSearchParams(window.location.search).get('calibrateSplat') === '1') {
      void this.enterCalibration();
    } else {
      this.promptInitialQualityIfNeeded();
    }
    this.loop();
  }

  private setupScene(): void {
    const tier = resolveEffectiveTier();
    this.scene.fog = tier === 'low' ? null : new THREE.Fog(0x15120f, 16, 42);
    this.scene.add(new THREE.HemisphereLight(0xf7e7c6, 0x1f2618, 2.2));

    const key = new THREE.DirectionalLight(0xffd391, 2.4);
    key.position.set(-4, 8, 5);
    key.castShadow = tier !== 'low';
    key.shadow.mapSize.set(tier === 'medium' ? 256 : 512, tier === 'medium' ? 256 : 512);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = tier === 'low' ? 20 : 30;
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    if (tier !== 'low') {
      const frost = new THREE.PointLight(0x7dd3fc, 12, 12);
      frost.position.set(5, 3, -4);
      this.scene.add(frost);

      const ember = new THREE.PointLight(0xff6b35, 10, 10);
      ember.position.set(-5, 2.6, 4);
      this.scene.add(ember);
    }

    this.camera.far = tier === 'low' ? 40 : 120;
    this.camera.position.set(0, 7, 9);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (event) => this.onKey(event, true));
    window.addEventListener('keyup', (event) => this.onKey(event, false));
    this.renderer.domElement.addEventListener('click', () => {
      this.renderer.domElement.requestPointerLock().catch(() => undefined);
    });
    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === this.renderer.domElement) {
        this.aimYaw -= event.movementX * 0.0035;
        this.aimPitch = clampPitch(this.aimPitch - event.movementY * 0.0028);
      }
    });

    this.ui.onCast = (spellId) => this.cast(spellId);
    this.ui.onVoiceToggle = () => this.voice.toggle();
    this.ui.onCancelQueue = () => this.returnToLobby();
    this.ui.onReturnLobby = () => this.returnToLobby();
    this.ui.onPortalAction = () => this.activateNearestPortal();
    this.ui.onQualitySettings = () => this.openQualityModal();
    this.calibrationUi.onChange = (settings, options) => this.applyCalibrationSettings(settings, options);
    this.calibrationUi.onBeforeReset = (settings) => this.backupCalibrationSettings(settings, 'before-reset');
    this.calibrationUi.onSelectMap = (presetId) => void this.switchCalibrationPreset(presetId, this.selectedSplatQuality);
    this.calibrationUi.onSelectQuality = (quality) => void this.switchCalibrationPreset(this.calibrationPreset?.calibrationGroupId ?? this.calibrationPreset?.presetId, quality);
    this.calibrationUi.onSave = () => this.saveCalibrationPreset();
    this.calibrationUi.onPublish = () => void this.publishCalibrationPreset();
    this.calibrationUi.onRestoreLast = () => this.restoreCalibrationHistory('last');
    this.calibrationUi.onRestoreBackup = () => this.restoreCalibrationHistory('backup');
    this.calibrationUi.onClearSaved = () => void this.clearSavedCalibrationPreset();
    this.calibrationUi.onTeleportSpawn = (index) => this.teleportCalibrationPlayer(index);
    this.calibrationUi.onShowCollisionDebug = (visible) => this.arenaRuntime?.setCollisionDebugVisible?.(visible);
    this.calibrationUi.onGenerateAutoCollision = () => void this.generateAutoCollision();
    this.calibrationUi.onClearAutoCollision = () => void this.clearAutoCollision();
    this.calibrationUi.onExit = () => this.returnToLobby();
    this.voice.onSpell = (spellId, raw) => {
      this.ui.showToast(raw.trim());
      this.cast(spellId);
    };
    this.voice.onStatus = (message) => this.ui.showToast(message);

    this.network.onState = (state) => this.applyState(state);
    this.network.onEvent = (type, payload) => this.handleNetEvent(type, payload);
  }

  private createMobileStartOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'mobile-start';
    overlay.dataset.ready = 'false';
    overlay.innerHTML = `
      <button type="button">
        <strong>Jugar en pantalla completa</strong>
        <span>Usa el celular de costado</span>
      </button>
    `;
    this.root.appendChild(overlay);
    overlay.querySelector('button')?.addEventListener('click', () => {
      void this.enterMobileFullscreen();
    });
    return overlay;
  }

  private createPortraitBlocker(): void {
    const overlay = document.createElement('div');
    overlay.className = 'portrait-blocker';
    overlay.setAttribute('aria-hidden', 'true');
    this.root.appendChild(overlay);
  }

  private async enterMobileFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      // Fullscreen is best effort on mobile browsers.
    }

    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // Orientation lock is not supported everywhere; CSS still blocks portrait play.
    }

    this.mobileStartEl.dataset.ready = 'true';
    this.resize();
  }

  private applyTouchCameraDelta(): void {
    const delta = this.touchControls.consumeCameraDelta();
    if (delta.yaw === 0 && delta.pitch === 0) return;
    this.aimYaw += delta.yaw;
    this.aimPitch = clampPitch(this.aimPitch + delta.pitch);
  }

  private activateNearestPortal(): void {
    if (this.sceneMode !== 'LOBBY') return;
    const portal = this.lobby?.nearestPortal();
    if (!portal) return;
    void this.enterCharacterSelect(portal.mode, portal.arenaId ?? DEFAULT_ARENA_ID);
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    const key = event.key.toLowerCase();
    if (isEditableTarget(event.target) && key !== 'escape') {
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
      event.preventDefault();
      if (down) this.keys.add(key);
      else this.keys.delete(key);
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (down && !event.repeat) {
        this.queueJumpOrDash();
      }
    }

    if (!down || event.repeat) return;
    if (key === 'f8' && (this.sceneMode === 'LOBBY' || this.sceneMode === 'CALIBRATION')) {
      event.preventDefault();
      if (this.sceneMode === 'CALIBRATION') this.returnToLobby();
      else void this.enterCalibration();
      return;
    }

    if (key === 'e' && this.sceneMode === 'LOBBY') {
      const portal = this.lobby?.nearestPortal();
      if (portal) {
        event.preventDefault();
        void this.enterCharacterSelect(portal.mode, portal.arenaId ?? DEFAULT_ARENA_ID);
      }
      return;
    }

    if (key === 'escape' && this.sceneMode === 'CHARACTER_SELECT') {
      this.returnToLobby();
      return;
    }

    if (key === 'escape' && this.sceneMode === 'QUEUE') {
      this.returnToLobby();
      return;
    }

    if (key === 'escape' && this.sceneMode === 'RESULTS') {
      this.returnToLobby();
      return;
    }

    if (key === 'escape' && this.sceneMode === 'CALIBRATION') {
      this.returnToLobby();
      return;
    }

    if (key === 'enter' && this.sceneMode === 'CHARACTER_SELECT') {
      event.preventDefault();
      this.confirmCharacterSelection(this.selectedCharacterClass);
      return;
    }

    if (this.sceneMode !== 'MATCH') return;

    const spell = SPELL_IDS.find((id) => event.key === String(SPELL_IDS.indexOf(id) + 1));
    if (spell) {
      event.preventDefault();
      this.cast(spell);
    }
  }

  private cast(spellId: SpellId): void {
    if (this.sceneMode !== 'MATCH') return;
    this.network.cast(spellId);
  }

  private applyState(state: any): void {
    this.phase = state.phase ?? this.phase;
    this.phaseMessage = state.message ?? this.phaseMessage;
    this.winnerId = state.winnerId ?? '';
    this.selectedMode = state.mode ?? this.selectedMode;
    this.selectedArenaId = coerceArenaId(state.arenaId ?? this.selectedArenaId);
    this.selectedArenaPresetId = stringValue(state.arenaPresetId, this.selectedArenaPresetId);
    this.selectedArenaPresetUrl = stringValue(state.arenaPresetUrl, this.selectedArenaPresetUrl);
    this.selectedArenaDisplayName = stringValue(state.arenaDisplayName, this.selectedArenaDisplayName);
    if ((this.sceneMode === 'QUEUE' || this.sceneMode === 'LOBBY') && this.phase === 'PLAYING') {
      this.enterMatch();
    }

    this.playerSnapshots.clear();
    const players = Array.from(state.players?.values?.() ?? []) as PlayerSnapshot[];
    const activeIds = new Set<string>();

    for (const player of players) {
      activeIds.add(player.id);

      // Reconciliación para jugador local con client-side prediction
      if (player.id === this.network.localSessionId && this.sceneMode === 'MATCH') {
        const existing = this.playerSnapshots.get(player.id);
        if (existing && needsReconciliation(existing, player, 0.8)) {
          this.playerSnapshots.set(player.id, player);
        } else if (existing) {
          this.playerSnapshots.set(player.id, {
            ...existing,
            y: player.y,
            hp: player.hp,
            mana: player.mana,
            anim: player.anim,
            casting: player.casting,
            selectedSpell: player.selectedSpell,
            rotY: player.rotY,
            teamId: player.teamId
          });
        } else {
          this.playerSnapshots.set(player.id, player);
        }
      } else {
        this.playerSnapshots.set(player.id, player);
      }

      if (this.sceneMode === 'MATCH') {
        this.ensurePlayerController(player);
      }
    }

    for (const [id, controller] of this.players) {
      if (!activeIds.has(id)) {
        controller.dispose(this.scene);
        this.players.delete(id);
      }
    }

    this.projectileSnapshots = Array.from(state.projectiles?.values?.() ?? []) as ProjectileSnapshot[];
    this.vfx.syncProjectiles(this.projectileSnapshots);
    this.syncControlState();

    if (this.sceneMode === 'MATCH' && this.phase === 'ENDED') {
      this.enterResults();
    }
  }

  private handleNetEvent(type: string, payload: any): void {
    if (type === 'phase') {
      this.phase = payload.phase;
      this.phaseMessage = payload.message ?? this.phaseMessage;
      this.winnerId = payload.winnerId ?? '';
      this.selectedArenaId = coerceArenaId(payload.arenaId ?? this.selectedArenaId);
      this.selectedArenaPresetId = stringValue(payload.arenaPresetId, this.selectedArenaPresetId);
      this.selectedArenaPresetUrl = stringValue(payload.arenaPresetUrl, this.selectedArenaPresetUrl);
      this.selectedArenaDisplayName = stringValue(payload.arenaDisplayName, this.selectedArenaDisplayName);
      this.syncControlState();
      if ((this.sceneMode === 'QUEUE' || this.sceneMode === 'LOBBY') && payload.phase === 'PLAYING') {
        this.enterMatch();
      }
      if (this.sceneMode === 'MATCH' && payload.phase === 'ENDED') {
        this.enterResults();
      }
      if (payload.message) this.ui.showToast(payload.message);
    }
    if (type === 'spell_confirmed') {
      this.vfx.confirmSpell(payload.spellId, payload.x, payload.y, payload.z);
      this.playCastVfx(payload.spellId, payload.playerId ?? this.network.localSessionId ?? '');
    }
    if (type === 'cast_denied') {
      this.ui.showToast(payload.reason ?? 'Cast denied');
    }
    if (type === 'damage') {
      this.ui.showToast(`-${payload.amount}`);
    }
  }

  private loop(): void {
    this.animationId = requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());

    this.applyTouchCameraDelta();
    this.applyTouchAction();
    this.updateScene(dt);
    this.sendMoveIfNeeded();
    this.vfx.update(dt);
    const local = this.sceneMode === 'CALIBRATION' ? this.calibrationSnapshot ?? undefined : this.getLocalSnapshot();
    const portal = this.lobby?.nearestPortal() ?? null;
    this.ui.update({
      scene: this.sceneMode,
      selectedMode: this.selectedMode,
      selectedArenaId: this.selectedArenaId,
      phase: this.phase,
      status: this.network.status,
      roomId: (this.network.room as any)?.id ?? (this.network.room as any)?.roomId ?? '',
      local,
      playerCount: this.sceneMode === 'CALIBRATION' ? 1 : this.playerSnapshots.size,
      requiredPlayers: this.getRequiredPlayers(),
      teamId: local?.teamId ?? null,
      projectileCount: this.projectileSnapshots.length,
      voiceActive: this.voice.active,
      voiceText: this.voice.transcript,
      localSessionId: this.network.localSessionId,
      localPlayerBound: this.localPlayerBound,
      controlsEnabled: this.controlsEnabled,
      cameraPitch: this.aimPitch,
      portalPrompt: this.sceneMode === 'LOBBY' && portal ? `Press E: ${portal.label}` : '',
      portalActionLabel: this.sceneMode === 'LOBBY' && portal ? portal.label : '',
      queueActive: this.sceneMode === 'QUEUE',
      resultsActive: this.sceneMode === 'RESULTS',
      resultsMessage: this.phaseMessage,
      arenaDebug: this.getArenaDebugInfo()
    });
    if (this.sceneMode === 'CALIBRATION') {
      this.calibrationUi.updateStatus(this.getArenaDebugInfo(), this.calibrationSnapshot);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private sendMoveIfNeeded(): void {
    const now = performance.now();
    if (now - this.lastMoveSent < 50) return;
    this.lastMoveSent = now;

    if (this.sceneMode === 'CALIBRATION') return;
    if (!this.controlsEnabled) return;

    this.network.sendMove(this.currentInput(true));
  }

  private getLocalSnapshot(): PlayerSnapshot | undefined {
    const id = this.network.localSessionId;
    return id ? this.playerSnapshots.get(id) : undefined;
  }

  private updateScene(dt: number): void {
    const input = this.currentInput(this.sceneMode === 'LOBBY' || this.sceneMode === 'QUEUE' || this.sceneMode === 'CALIBRATION');
    if (this.sceneMode === 'CHARACTER_SELECT') {
      this.updatePreview(dt);
      return;
    }

    if (this.sceneMode === 'LOBBY' || this.sceneMode === 'QUEUE') {
      this.lobby?.update(input, dt);
      if (this.lobby) {
        this.cameraRig.update(this.camera, this.lobby.getPlayerPosition(), this.lobby.getPlayerRotation(), this.aimPitch, dt);
      }
      return;
    }

    if (this.sceneMode === 'CALIBRATION') {
      this.updateCalibration(input, dt);
      return;
    }

    this.arenaRuntime?.update(dt);

    // Client-Side Prediction: aplicar movimiento horizontal inmediato al jugador local
    const localId = this.network.localSessionId;
    const localSnapshot = localId ? this.playerSnapshots.get(localId) : undefined;
    if (localSnapshot && this.controlsEnabled && this.sceneMode === 'MATCH' && this.phase === 'PLAYING') {
      // No consumir acciones aquí; eso lo hace sendMoveIfNeeded
      const input = this.currentInput(false);
      applyPredictedHorizontalMovement(localSnapshot, input, dt);
    }

    for (const [id, snapshot] of this.playerSnapshots) {
      const controller = this.players.get(id);
      controller?.update(snapshot, dt, id === localId);
    }

    const local = this.getLocalSnapshot();
    if (local) {
      this.cameraRig.update(this.camera, new THREE.Vector3(local.x, local.y, local.z), this.aimYaw, this.aimPitch, dt);
    }
  }

  private currentInput(consumeActions = false): MoveInput {
    const touch = this.touchControls.getMovement();
    const jump = consumeActions ? this.consumeJumpQueued() : false;
    const dash = consumeActions && !jump ? this.consumeDashQueuedIfReady() : false;
    return {
      forward: this.keys.has('w') || this.keys.has('arrowup') || touch.forward,
      backward: this.keys.has('s') || this.keys.has('arrowdown') || touch.backward,
      left: this.keys.has('a') || this.keys.has('arrowleft') || touch.left,
      right: this.keys.has('d') || this.keys.has('arrowright') || touch.right,
      jump,
      dash,
      rotY: this.aimYaw
    };
  }

  private consumeJumpQueued(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  private consumeDashQueuedIfReady(): boolean {
    if (!this.dashQueued) return false;
    if (this.sceneMode !== 'MATCH') {
      this.dashQueued = false;
      return false;
    }

    const waitedMs = performance.now() - this.dashQueuedAt;
    if (!this.isLocalPlayerAirborne()) {
      if (waitedMs < 700) return false;
      this.dashQueued = false;
      return false;
    }

    this.dashQueued = false;
    return true;
  }

  private queueJumpOrDash(): void {
    if (this.sceneMode === 'MATCH' && (this.jumpQueued || this.isLocalPlayerAirborne() || this.recentlyRequestedJump())) {
      this.dashQueued = true;
      this.dashQueuedAt = performance.now();
      return;
    }

    this.jumpQueued = true;
    this.lastJumpActionAt = performance.now();
  }

  private recentlyRequestedJump(): boolean {
    return performance.now() - this.lastJumpActionAt < 500;
  }

  private applyTouchAction(): void {
    if (this.touchControls.consumeActionQueued()) {
      this.queueJumpOrDash();
    }
  }

  private isLocalPlayerAirborne(): boolean {
    const local = this.getLocalSnapshot();
    if (!local) return false;
    const floorY = this.getArenaDebugInfo()?.floorY ?? 0;
    return local.y > floorY + 0.08;
  }

  private clearQueuedActions(): void {
    this.jumpQueued = false;
    this.lastJumpActionAt = 0;
    this.dashQueued = false;
    this.dashQueuedAt = 0;
  }

  private ensurePlayerController(player: PlayerSnapshot): void {
    const localId = this.network.localSessionId;
    const shouldBeLocal = player.id === localId;
    const isCurrentLocal = player.id === this.localControllerId;
    const existing = this.players.get(player.id);

    if (existing && shouldBeLocal === isCurrentLocal) return;

    if (existing) {
      existing.dispose(this.scene);
    }

    const controller = this.createPlayerController(player, shouldBeLocal);
    controller.setName(player.name);
    controller.setFirstPersonHidden(shouldBeLocal);
    this.players.set(player.id, controller);
    this.setupVfxAttachPoints(player.id, controller);

    if (shouldBeLocal) {
      this.localControllerId = player.id;
    } else if (isCurrentLocal) {
      this.localControllerId = null;
    }
  }

  private createPlayerController(player: PlayerSnapshot, local: boolean): PlayerController {
    const characterClass = resolveCharacterClass(player.characterClass);
    const gltf = this.gltfCache.get(characterClass);
    if (gltf) {
      try {
        return AnimatedPlayerController.create(this.scene, local, gltf, characterClass, player.teamId ?? 'A');
      } catch (error) {
        console.warn(`[GameApp] Animated player fallback for ${characterClass}`, error);
      }
    } else {
      void this.loadCharacterGltfCached(characterClass);
    }

    return local
      ? new LocalPlayerController(this.scene, true, player.teamId ?? 'A')
      : new RemotePlayerController(this.scene, false, player.teamId ?? 'A');
  }

  private setupVfxAttachPoints(playerId: string, controller: PlayerController): void {
    const root = controller.group;

    const head = new THREE.Group();
    head.position.set(0, 1.6, 0);
    root.add(head);
    this.vfx.setPlayerAttachPoint(playerId, 'caster_head', head);

    const handR = new THREE.Group();
    handR.position.set(0.4, 0.8, 0);
    root.add(handR);
    this.vfx.setPlayerAttachPoint(playerId, 'caster_hand_right', handR);

    const handL = new THREE.Group();
    handL.position.set(-0.4, 0.8, 0);
    root.add(handL);
    this.vfx.setPlayerAttachPoint(playerId, 'caster_hand_left', handL);

    this.vfx.setPlayerAttachPoint(playerId, 'caster_root', root);
  }

  private playCastVfx(spellId: SpellId, playerId: string): void {
    this.vfx.playAtAttachPoint(`${spellId}_cast`, playerId, 'caster_hand_right');
  }

  private promptInitialQualityIfNeeded(): void {
    if (this.initialQualitySelected) {
      this.enterLobby();
      return;
    }
    const saved = localStorage.getItem('mc_graphics_tier');
    if (saved) {
      this.initialQualitySelected = true;
      this.enterLobby();
      return;
    }
    this.qualityPicker = new QualityPicker(this.root);
    this.qualityPicker.onSelect = (tier, remember) => {
      if (remember) {
        saveGraphicsTier(tier);
      }
      this.initialQualitySelected = true;
      this.selectedSplatQuality = tierToSplatQuality(tier === 'auto' ? resolveEffectiveTier() : tier);
      this.qualityPicker?.dispose();
      this.qualityPicker = null;
      this.enterLobby();
    };
    this.qualityPicker.show();
  }

  private openQualityModal(): void {
    const currentTier: GraphicsTier = (localStorage.getItem('mc_graphics_tier') as GraphicsTier | null) ?? 'auto';
    this.qualityModal = new QualitySettingsModal(this.root, currentTier);
  }

  private syncControlState(): void {
    if (this.sceneMode === 'CALIBRATION') {
      this.localPlayerBound = Boolean(this.calibrationSnapshot);
      this.controlsEnabled = true;
      return;
    }

    this.localPlayerBound = Boolean(this.getLocalSnapshot());
    this.controlsEnabled = this.sceneMode === 'MATCH' && this.network.connected && this.localPlayerBound && this.phase === 'PLAYING';

    if (!this.controlsEnabled) {
      this.keys.clear();
      this.clearQueuedActions();
    }
  }

  private enterLobby(): void {
    this.queueToken++;
    this.sceneMode = 'LOBBY';
    this.characterSelectUi.hide();
    this.clearPreview();
    this.selectedMode = null;
    this.selectedArenaId = DEFAULT_ARENA_ID;
    this.selectedArenaPresetId = '';
    this.selectedArenaPresetUrl = '';
    this.selectedArenaDisplayName = '';
    this.phase = 'WAITING';
    this.phaseMessage = '';
    this.controlsEnabled = false;
    this.localPlayerBound = false;
    this.clearQueuedActions();
    this.touchControls.reset();
    this.clearMatchScene();
    this.network.leave();
    if (!this.lobby) {
      this.lobby = new LobbyScene(this.scene);
    }
    this.ui.showToast('Choose a portal');
  }

  private async enterCalibration(): Promise<void> {
    const token = ++this.queueToken;
    this.sceneMode = 'CALIBRATION';
    this.selectedMode = '1v1';
    this.selectedArenaId = SPLAT_TEST_ARENA_ID;
    this.phase = 'CALIBRATION';
    this.phaseMessage = 'Local splat calibration';
    this.controlsEnabled = true;
    this.localPlayerBound = false;
    this.clearQueuedActions();
    this.playerSnapshots.clear();
    this.projectileSnapshots = [];
    this.vfx.syncProjectiles([]);
    this.clearMatchScene();
    this.lobby?.dispose();
    this.lobby = null;
    this.network.leave();
    this.ui.showToast('Loading splat calibration');

    let preset: SplatArenaPreset;
    let selectedMapId = '';
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedPresetId = params.get('map') ?? undefined;
      const requestedQuality = normalizeSplatQualityParam(params.get('quality'));
      const loaded = await loadConfiguredSplatArenaPreset(requestedPresetId, requestedQuality);
      this.splatCatalog = loaded.catalog;
      this.calibrationBasePreset = loaded.basePreset;
      preset = loaded.preset;
      selectedMapId = loaded.entry.presetId;
      this.selectedSplatQuality = loaded.quality;
      setStoredSplatPresetId(selectedMapId);
      setStoredSplatQuality(loaded.quality);
    } catch (error) {
      preset = defaultSplatCalibrationPreset();
      this.calibrationBasePreset = preset;
      selectedMapId = getSplatCalibrationStorageKey(preset);
      this.selectedSplatQuality = preset.quality ?? 'high';
      this.splatCatalog = {
        defaultPresetId: preset.presetId,
        maps: [{
          presetId: getSplatCalibrationStorageKey(preset),
          displayName: preset.displayName,
          presetUrl: '/arena-presets/splat-test.json',
          splatUrl: preset.splatUrl,
          splatFileSizeBytes: preset.splatFileSizeBytes,
          enabledModes: [...preset.enabledModes],
          calibrationGroupId: preset.calibrationGroupId,
          quality: preset.quality,
          defaultQuality: preset.quality ?? 'high',
          qualities: {
            [preset.quality ?? 'high']: {
              presetId: preset.presetId,
              presetUrl: '/arena-presets/splat-test.json',
              splatUrl: preset.splatUrl,
              splatFileSizeBytes: preset.splatFileSizeBytes
            }
          }
        }]
      };
      this.ui.showToast('Preset failed; using calibration defaults');
      console.warn(error);
    }

    if (token !== this.queueToken || this.sceneMode !== 'CALIBRATION') return;

    const settings = calibrationSettingsFromPreset(preset);
    this.calibrationPreset = preset;
    this.calibrationSettings = settings;
    this.calibrationSnapshot = makeCalibrationSnapshot(this.localName, settings.spawnPoints[0], settings.floorY);
    this.calibrationVelocityY = 0;
    this.aimYaw = this.calibrationSnapshot.rotY;
    this.aimPitch = 0;
    this.calibrationController = new LocalPlayerController(this.scene, true, 'A');
    this.calibrationController.setFirstPersonHidden(true);
    this.calibrationController.setName('Calibrator');
    this.calibrationController.update(this.calibrationSnapshot, 1, true);
    this.calibrationGuide = createCalibrationGuide(settings);
    this.scene.add(this.calibrationGuide);
    this.localPlayerBound = true;

    this.arenaRuntime = createArenaProvider(SPLAT_TEST_ARENA_ID, { preset }).mount({
      scene: this.scene,
      renderer: this.renderer,
      shell: this.shell,
      camera: this.camera,
      onStatus: (message) => this.ui.showToast(message)
    });
    this.arenaRuntime.applyCalibration?.(settings);
    this.calibrationUi.setMaps(this.splatCatalog.maps, selectedMapId || getSplatCalibrationStorageKey(preset), this.selectedSplatQuality);
    this.calibrationUi.show(preset, settings, this.calibrationBasePreset ?? preset);
    this.calibrationUi.setSaveInfo(loadLatestCompatibleHistoryEntry(preset));
    this.ui.showToast('Splat calibration mode');
  }

  private async enterCharacterSelect(mode: MatchMode, arenaId: ArenaId = DEFAULT_ARENA_ID): Promise<void> {
    const token = ++this.queueToken;
    this.sceneMode = 'CHARACTER_SELECT';
    this.selectedMode = mode;
    this.selectedArenaId = arenaId;
    this.selectedArenaPresetId = '';
    this.selectedArenaPresetUrl = '';
    this.selectedArenaDisplayName = '';
    this.phase = 'WAITING';
    this.phaseMessage = 'Choose your mage';
    this.controlsEnabled = false;
    this.localPlayerBound = false;
    this.clearQueuedActions();
    this.keys.clear();
    this.touchControls.reset();
    this.playerSnapshots.clear();
    this.projectileSnapshots = [];
    this.clearMatchScene();
    this.lobby?.dispose();
    this.lobby = null;
    this.network.leave();
    this.characterSelectUi.show();
    this.ui.showToast('Choose your mage');
    await this.loadPreviewModel(this.selectedCharacterClass);
    if (token !== this.queueToken || this.sceneMode !== 'CHARACTER_SELECT') {
      this.clearPreview();
    }
  }

  private confirmCharacterSelection(characterClass: CharacterClass): void {
    this.selectedCharacterClass = characterClass;
    this.clearPreview();
    this.characterSelectUi.hide();
    void this.enterQueue(this.selectedMode ?? '1v1', this.selectedArenaId);
  }

  private switchPreviewClass(characterClass: CharacterClass): void {
    this.selectedCharacterClass = characterClass;
    if (this.sceneMode === 'CHARACTER_SELECT') {
      void this.loadPreviewModel(characterClass);
    }
  }

  private async enterQueue(mode: MatchMode, _arenaId: ArenaId = DEFAULT_ARENA_ID): Promise<void> {
    const token = ++this.queueToken;
    this.sceneMode = 'QUEUE';
    this.selectedMode = mode;
    this.selectedArenaId = DEFAULT_ARENA_ID;
    this.selectedArenaPresetId = '';
    this.selectedArenaPresetUrl = '';
    this.selectedArenaDisplayName = '';
    this.phase = 'WAITING';
    this.phaseMessage = `Finding ${mode}`;
    this.characterSelectUi.hide();
    this.clearPreview();
    this.clearQueuedActions();
    this.playerSnapshots.clear();
    this.projectileSnapshots = [];
    this.touchControls.reset();
    this.clearMatchScene();
    this.ui.showToast(`Finding ${mode}`);
    this.network.leave();
    const nextNetwork = new NetworkClient(resolveServerUrl());
    nextNetwork.onState = (state) => this.applyState(state);
    nextNetwork.onEvent = (type, payload) => this.handleNetEvent(type, payload);
    this.network = nextNetwork;
    try {
      await nextNetwork.connect(this.localName, mode, this.selectedCharacterClass);
      if (token !== this.queueToken || this.network !== nextNetwork || this.sceneMode !== 'QUEUE') {
        nextNetwork.leave();
      }
    } catch (error) {
      if (token !== this.queueToken) return;
      this.ui.showToast('Queue failed');
      console.error(error);
      this.returnToLobby();
    }
  }

  private enterMatch(): void {
    if (this.sceneMode === 'MATCH') return;
    this.sceneMode = 'MATCH';
    this.characterSelectUi.hide();
    this.clearPreview();
    this.lobby?.dispose();
    this.lobby = null;
    const arenaOptions = this.selectedArenaId === SPLAT_TEST_ARENA_ID && this.selectedArenaPresetUrl
      ? { presetUrl: this.selectedArenaPresetUrl }
      : {};
    this.arenaRuntime = createArenaProvider(this.selectedArenaId, arenaOptions).mount({
      scene: this.scene,
      renderer: this.renderer,
      shell: this.shell,
      camera: this.camera,
      onStatus: (message) => this.ui.showToast(message)
    });
    this.syncControlState();
    void this.vfx.preload();
    this.ui.showToast(this.selectedArenaDisplayName
      ? `${this.selectedMode ?? 'Match'}: ${this.selectedArenaDisplayName}`
      : `${this.selectedMode ?? 'Match'} started`);
  }

  private enterResults(): void {
    this.sceneMode = 'RESULTS';
    this.controlsEnabled = false;
    this.keys.clear();
    this.clearQueuedActions();
    this.touchControls.reset();

    // Play victory/defeat animations
    for (const [id, controller] of this.players) {
      const snapshot = this.playerSnapshots.get(id);
      if (!snapshot) continue;
      const isWinner = id === this.winnerId;
      snapshot.anim = isWinner ? 'victory' : 'defeat';
      controller.update(snapshot, 0, true);
    }

    this.ui.showToast(this.phaseMessage || 'Match ended');
  }

  private returnToLobby(): void {
    this.enterLobby();
  }

  private bindCharacterPreviewEvents(): void {
    const preview = this.characterSelectUi.previewArea;
    preview.addEventListener('pointerdown', (event) => {
      if (this.sceneMode !== 'CHARACTER_SELECT') return;
      this.previewDrag = true;
      this.previewAutoRotate = false;
      this.previewLastX = event.clientX;
      preview.setPointerCapture(event.pointerId);
    });
    preview.addEventListener('pointermove', (event) => {
      if (!this.previewDrag || !this.previewGroup) return;
      const dx = event.clientX - this.previewLastX;
      this.previewLastX = event.clientX;
      this.previewRotY += dx * 0.01;
      this.previewGroup.rotation.y = this.previewRotY;
    });
    const stopDrag = (event: PointerEvent) => {
      if (!this.previewDrag) return;
      this.previewDrag = false;
      preview.releasePointerCapture(event.pointerId);
    };
    preview.addEventListener('pointerup', stopDrag);
    preview.addEventListener('pointercancel', stopDrag);
  }

  private async preloadCharacterModels(): Promise<void> {
    await Promise.allSettled([
      this.loadCharacterGltfCached('arcanist'),
      this.loadCharacterGltfCached('divine')
    ]);
  }

  private loadCharacterGltfCached(characterClass: CharacterClass): Promise<CharacterGltf | null> {
    const cached = this.gltfCache.get(characterClass);
    if (cached) return Promise.resolve(cached);

    const existing = this.gltfLoads.get(characterClass);
    if (existing) return existing;

    const load = preloadCharacterGltf(characterClass)
      .then((gltf) => {
        this.gltfCache.set(characterClass, gltf);
        return gltf;
      })
      .catch((error) => {
        console.warn(`[GameApp] Failed to load ${characterClass} model`, error);
        return null;
      })
      .finally(() => {
        this.gltfLoads.delete(characterClass);
      });
    this.gltfLoads.set(characterClass, load);
    return load;
  }

  private async loadPreviewModel(characterClass: CharacterClass): Promise<void> {
    this.clearPreview();
    const token = ++this.previewToken;

    const previewGroup = new THREE.Group();
    previewGroup.position.set(0, 0, 0);
    this.previewGroup = previewGroup;
    this.scene.add(previewGroup);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x352416, 1.7);
    hemi.position.set(0, 2, 0);
    previewGroup.add(hemi);

    const key = new THREE.DirectionalLight(0xfff0d0, 2.2);
    key.position.set(2.4, 4, 2.8);
    previewGroup.add(key);

    const rim = new THREE.DirectionalLight(0x8fbaff, 0.85);
    rim.position.set(-2.6, 2.2, -2.2);
    previewGroup.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.96, 0.16, 36),
      new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.74, metalness: 0.08 })
    );
    pedestal.position.y = 0.08;
    previewGroup.add(pedestal);

    const gltf = await this.loadCharacterGltfCached(characterClass);
    if (token !== this.previewToken || this.sceneMode !== 'CHARACTER_SELECT' || this.previewGroup !== previewGroup) {
      return;
    }

    if (!gltf) {
      this.addFallbackPreview(previewGroup, characterClass);
    } else {
      const model = cloneCharacterScene(gltf.scene);
      model.rotation.y = Math.PI;
      model.position.y = 0.16;
      previewGroup.add(model);
      this.previewMixer = new THREE.AnimationMixer(model);
      this.previewActions.clear();
      for (const clip of gltf.animations) {
        const action = this.previewMixer.clipAction(clip);
        action.clampWhenFinished = true;
        this.previewActions.set(clip.name, action);
      }
      this.playPreviewAnim('reposo');
    }

    this.camera.position.set(0, 1.45, 2.9);
    this.camera.lookAt(0, 1.05, 0);
  }

  private addFallbackPreview(previewGroup: THREE.Group, characterClass: CharacterClass): void {
    const color = characterClass === 'divine' ? 0xf5c45e : 0x7c3aed;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 0.96, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.36, emissive: color, emissiveIntensity: 0.18 })
    );
    body.position.y = 0.86;
    previewGroup.add(body);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.44, 0.64, 6),
      new THREE.MeshStandardMaterial({ color: 0xf7e7c6, roughness: 0.5 })
    );
    hat.position.y = 1.64;
    previewGroup.add(hat);
  }

  private updatePreview(dt: number): void {
    this.previewMixer?.update(dt);
    if (this.previewGroup && this.previewAutoRotate && !this.previewDrag) {
      this.previewRotY += dt * 0.42;
      this.previewGroup.rotation.y = this.previewRotY;
    }
  }

  private playPreviewAnim(name: string): void {
    const action = this.previewActions.get(name);
    if (!action) return;
    for (const entry of this.previewActions.values()) {
      entry.fadeOut(0.16);
    }
    action.reset().fadeIn(0.16).play();
  }

  private clearPreview(): void {
    this.previewToken++;
    if (this.previewGroup) {
      this.scene.remove(this.previewGroup);
      this.previewGroup.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose?.();
      });
      this.previewGroup = null;
    }
    this.previewMixer = null;
    this.previewActions.clear();
    this.previewRotY = 0;
    this.previewAutoRotate = true;
    this.previewDrag = false;
  }

  private updateCalibration(input: MoveInput, dt: number): void {
    if (!this.calibrationSnapshot || !this.calibrationSettings || !this.calibrationController) return;

    const snapshot = this.calibrationSnapshot;
    const settings = this.calibrationSettings;
    const yaw = input.rotY ?? snapshot.rotY;
    snapshot.rotY = yaw;

    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += forward.x; mz += forward.z; }
    if (input.backward) { mx -= forward.x; mz -= forward.z; }
    if (input.right) { mx += right.x; mz += right.z; }
    if (input.left) { mx -= right.x; mz -= right.z; }
    const length = Math.hypot(mx, mz);
    if (length > 0) {
      mx /= length;
      mz /= length;
    }

    const bounds = normalizeBounds(settings.bounds);
    const voxelCollision = this.arenaRuntime?.getVoxelCollision?.() ?? null;
    const resolved = moveWithArenaCollision(
      snapshot.x,
      snapshot.z,
      snapshot.x + mx * 5.8 * dt,
      snapshot.z + mz * 5.8 * dt,
      bounds,
      settings.collisionWalls,
      {
        playerY: snapshot.y,
        floorY: settings.floorY,
        voxelCollision,
        collisionErasers: settings.collisionErasers
      }
    );
    snapshot.x = resolved.x;
    snapshot.z = resolved.z;
    const climbing = this.applyCalibrationJump(input, dt, settings);
    snapshot.anim = climbing
      ? 'climb'
      : snapshot.y > settings.floorY + 0.03 || Math.abs(this.calibrationVelocityY) > 0.01
      ? 'jump'
      : length > 0 ? 'run' : 'idle';
    snapshot.casting = false;
    snapshot.selectedSpell = '';
    this.calibrationController.update(snapshot, dt, true);
    updateCalibrationGuide(this.calibrationGuide, settings);
    this.arenaRuntime?.update(dt);
    this.cameraRig.update(this.camera, new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z), yaw, this.aimPitch, dt, true);
  }

  private applyCalibrationSettings(settings: SplatCalibrationSettings, options: { autosave?: boolean } = {}): void {
    this.calibrationSettings = cloneCalibrationSettings(settings);
    if (this.calibrationSnapshot) {
      if (this.calibrationSnapshot.y < settings.floorY) {
        this.calibrationSnapshot.y = settings.floorY;
        this.calibrationVelocityY = 0;
      }
    }
    updateCalibrationGuide(this.calibrationGuide, settings);
    this.arenaRuntime?.applyCalibration?.(settings);
    if (options.autosave !== false) {
      this.autosaveCalibrationPreset(settings);
    }
  }

  private async generateAutoCollision(): Promise<void> {
    if (this.sceneMode !== 'CALIBRATION' || !this.calibrationPreset || !this.calibrationSettings) return;

    const legacyAutoCount = countAutoCollisionWalls(this.calibrationSettings.collisionWalls);
    const settings: SplatCalibrationSettings = {
      ...cloneCalibrationSettings(this.calibrationSettings),
      collisionWalls: clearAutoCollisionWalls(this.calibrationSettings.collisionWalls)
    };
    let preset = this.calibrationPreset;
    this.calibrationUi.setFeedback('Generating voxel auto collision. This can take a moment locally...');
    this.ui.showToast('Generating auto collision');

    let collisionMeshUrl = preset.collisionMeshUrl;
    let voxelCollisionUrl = preset.voxelCollisionUrl;
    const generated = await requestDevSplatCollisionGeneration(preset);
    if (generated.ok && generated.voxelCollisionUrl) {
      collisionMeshUrl = generated.collisionMeshUrl ?? collisionMeshUrl;
      voxelCollisionUrl = generated.voxelCollisionUrl;
    } else {
      const detectedAfterGenerate = await detectGeneratedCollisionUrls(preset);
      if (!detectedAfterGenerate.voxelCollisionUrl) {
        this.calibrationUi.setFeedback(`Generator unavailable: ${generated.error ?? 'unknown error'}. Run: ${generated.command ?? 'npm run splat:collision'}`);
        this.ui.showToast('Auto collision generator unavailable');
        return;
      }
      collisionMeshUrl = generated.collisionMeshUrl ?? detectedAfterGenerate.collisionMeshUrl ?? collisionMeshUrl;
      voxelCollisionUrl = detectedAfterGenerate.voxelCollisionUrl;
    }

    if (!voxelCollisionUrl) {
      const command = `npm run splat:collision -- --input client/public/splats/${splatFilenameFromUrl(preset.splatUrl) ?? '<arena>.sog'} --arena ${collisionAssetIdFromPreset(preset)}`;
      this.calibrationUi.setFeedback(`Generator unavailable: voxel files were not found. Run: ${command}`);
      this.ui.showToast('Auto collision generator unavailable');
      return;
    }

    const nextSettings = settings;
    const nextPreset = applyCalibrationToPreset(preset, nextSettings);
    preset = {
      ...nextPreset,
      collisionMeshUrl: collisionMeshUrl ?? null,
      voxelCollisionUrl
    };
    this.calibrationPreset = preset;
    this.calibrationUi.setPreset(preset);
    this.applyCalibrationSettings(nextSettings);
    this.calibrationUi.setSettings(nextSettings);
    await this.arenaRuntime?.reloadCollisionProxy?.(preset);
    this.arenaRuntime?.setCollisionDebugVisible?.(false);
    const savedPresets = generated.ok && generated.updatedPresets?.length
      ? ` Saved into ${generated.updatedPresets.join(', ')}.`
      : '';
    this.calibrationUi.setFeedback(`Voxel auto collision active from ${preset.voxelCollisionUrl}.${savedPresets} Debug mesh stays hidden unless you enable Show Generated Collision. Manual blockers/ladders and eraser zones stay editable.${legacyAutoCount > 0 ? ` Removed ${legacyAutoCount} legacy auto walls.` : ''}`);
    this.ui.showToast('Voxel auto collision active');
  }

  private async clearAutoCollision(): Promise<void> {
    if (this.sceneMode !== 'CALIBRATION' || !this.calibrationPreset || !this.calibrationSettings) return;

    const removedCount = countAutoCollisionWalls(this.calibrationSettings.collisionWalls);
    const nextSettings: SplatCalibrationSettings = {
      ...cloneCalibrationSettings(this.calibrationSettings),
      collisionWalls: clearAutoCollisionWalls(this.calibrationSettings.collisionWalls)
    };
    let nextPreset = {
      ...applyCalibrationToPreset(this.calibrationPreset, nextSettings),
      collisionMeshUrl: null,
      voxelCollisionUrl: null
    };
    let feedback = removedCount > 0
      ? `Removed ${removedCount} legacy auto walls. Manual walls, ladders, and erasers were kept.`
      : 'Voxel auto collision disabled for this preset. Manual walls, ladders, and erasers were kept.';

    const deleted = await requestDevSplatCollisionDeletion(this.calibrationPreset);
    if (deleted.ok) {
      await this.arenaRuntime?.reloadCollisionProxy?.(nextPreset);
      feedback += deleted.deleted && deleted.deleted.length > 0
        ? ` Deleted generated files: ${deleted.deleted.join(', ')}.`
        : ' No generated files needed deletion.';
    } else if (this.calibrationPreset.collisionMeshUrl || this.calibrationPreset.voxelCollisionUrl) {
      await this.arenaRuntime?.reloadCollisionProxy?.(nextPreset);
      feedback += ` Generated files were not deleted: ${deleted.error ?? 'endpoint unavailable'}. They are disabled in this local preset.`;
    }

    this.calibrationPreset = nextPreset;
    this.calibrationUi.setPreset(nextPreset);
    this.applyCalibrationSettings(nextSettings);
    this.calibrationUi.setSettings(nextSettings);
    this.calibrationUi.setFeedback(feedback);
    this.ui.showToast('Auto collision cleared');
  }

  private applyCalibrationJump(input: MoveInput, dt: number, settings: SplatCalibrationSettings): boolean {
    if (!this.calibrationSnapshot) return false;

    const floorY = settings.floorY;
    const walls = settings.collisionWalls;
    const voxelOptions = {
      voxelCollision: this.arenaRuntime?.getVoxelCollision?.() ?? null,
      collisionErasers: settings.collisionErasers
    };
    const climbableWall = findClimbableWall(
      this.calibrationSnapshot.x,
      this.calibrationSnapshot.z,
      walls
    );
    if (climbableWall) {
      const maxY = floorY + Math.max(0.1, climbableWall.height);
      const climbDirection = (input.forward || input.jump ? 1 : 0) - (input.backward ? 1 : 0);
      this.calibrationSnapshot.y = clamp(
        this.calibrationSnapshot.y + climbDirection * PLAYER_CLIMB_SPEED * dt,
        floorY,
        maxY
      );
      this.calibrationVelocityY = 0;
      return true;
    }

    const groundY = findStandingSurfaceY(
      this.calibrationSnapshot.x,
      this.calibrationSnapshot.z,
      this.calibrationSnapshot.y,
      floorY,
      walls,
      undefined,
      undefined,
      voxelOptions
    );
    const grounded = Math.abs(this.calibrationSnapshot.y - groundY) <= 0.02;
    if (grounded && input.jump) {
      this.calibrationSnapshot.y = groundY;
      this.calibrationVelocityY = PLAYER_JUMP_VELOCITY;
    } else if (grounded && this.calibrationVelocityY <= 0) {
      this.calibrationSnapshot.y = groundY;
      this.calibrationVelocityY = 0;
    }

    if (!grounded || this.calibrationVelocityY > 0) {
      const previousY = this.calibrationSnapshot.y;
      this.calibrationVelocityY -= PLAYER_GRAVITY * dt;
      const vertical = resolveArenaVerticalCollision(
        this.calibrationSnapshot.x,
        this.calibrationSnapshot.z,
        previousY,
        this.calibrationSnapshot.y + this.calibrationVelocityY * dt,
        this.calibrationVelocityY,
        floorY,
        walls,
        undefined,
        voxelOptions
      );
      this.calibrationSnapshot.y = vertical.y;
      this.calibrationVelocityY = vertical.velocityY;
    }
    return false;
  }

  private async switchCalibrationPreset(presetId: string | undefined, quality = this.selectedSplatQuality): Promise<void> {
    if (this.sceneMode !== 'CALIBRATION') return;
    const token = ++this.queueToken;
    this.calibrationUi.setFeedback('Loading selected map...');
    try {
      const loaded = await loadConfiguredSplatArenaPreset(presetId, quality);
      if (token !== this.queueToken || this.sceneMode !== 'CALIBRATION') return;
      this.splatCatalog = loaded.catalog;
      this.calibrationBasePreset = loaded.basePreset;
      this.selectedSplatQuality = loaded.quality;
      setStoredSplatPresetId(loaded.entry.presetId);
      setStoredSplatQuality(loaded.quality);
      this.applyCalibrationPreset(loaded.preset);
      this.calibrationUi.setMaps(loaded.catalog.maps, loaded.entry.presetId, loaded.quality);
      this.calibrationUi.show(loaded.preset, calibrationSettingsFromPreset(loaded.preset), loaded.basePreset);
      this.calibrationUi.setSaveInfo(loadLatestCompatibleHistoryEntry(loaded.preset));
      this.ui.showToast(`Map selected: ${loaded.preset.displayName}`);
    } catch (error) {
      this.calibrationUi.setFeedback('Map failed to load; keeping current map.');
      this.ui.showToast('Map failed to load');
      console.warn(error);
    }
  }

  private saveCalibrationPreset(): void {
    if (!this.calibrationPreset || !this.calibrationSettings) return;
    const preset = applyCalibrationToPreset(this.calibrationPreset, this.calibrationSettings);
    const entry = saveConfiguredSplatArenaPreset(preset, 'manual-save');
    this.calibrationPreset = preset;
    this.calibrationUi.setSaveInfo(entry ?? loadLatestCompatibleHistoryEntry(preset));
    this.calibrationUi.setFeedback('Config saved inside the game for this browser.');
    this.ui.showToast('Map config saved');
  }

  private async publishCalibrationPreset(): Promise<void> {
    if (!this.calibrationPreset || !this.calibrationSettings) return;
    const preset = applyCalibrationToPreset(this.calibrationPreset, this.calibrationSettings);
    this.calibrationPreset = preset;
    this.calibrationUi.setPreset(preset);
    this.calibrationUi.setFeedback('Publishing map preset to project files...');
    this.ui.showToast('Publishing map');
    const result = await requestDevSplatMapPublish(preset);
    if (!result.ok) {
      const suffix = result.command ? ` ${result.command}` : '';
      this.calibrationUi.setFeedback(`Publish unavailable: ${result.error ?? 'request failed'}.${suffix}`);
      this.ui.showToast('Publish unavailable');
      return;
    }
    const updated = result.updatedPresets?.length ? result.updatedPresets.join(', ') : 'project presets';
    const modes = preset.enabledModes.length ? preset.enabledModes.join(', ') : 'no matchmaking modes';
    this.calibrationUi.setFeedback(`Map published for ${modes}. Updated ${updated}.`);
    this.ui.showToast('Map published');
  }

  private autosaveCalibrationPreset(settings: SplatCalibrationSettings): void {
    if (!this.calibrationPreset) return;
    const preset = applyCalibrationToPreset(this.calibrationPreset, settings);
    const entry = saveConfiguredSplatArenaPreset(preset, 'autosave');
    this.calibrationPreset = preset;
    this.calibrationUi.setSaveInfo(entry ?? loadLatestCompatibleHistoryEntry(preset));
  }

  private backupCalibrationSettings(settings: SplatCalibrationSettings, reason: 'before-reset'): void {
    if (!this.calibrationPreset) return;
    const preset = applyCalibrationToPreset(this.calibrationPreset, settings);
    const entry = saveConfiguredSplatArenaPreset(preset, reason);
    this.calibrationPreset = preset;
    this.calibrationUi.setSaveInfo(entry ?? loadLatestCompatibleHistoryEntry(preset));
  }

  private restoreCalibrationHistory(kind: 'last' | 'backup'): void {
    if (!this.calibrationPreset) return;
    const entry = kind === 'last'
      ? loadLatestCompatibleHistoryEntry(this.calibrationPreset)
      : loadLatestCompatibleBackupEntry(this.calibrationPreset);
    if (!entry) {
      this.calibrationUi.setFeedback(kind === 'last' ? 'No saved version found.' : 'No backup version found.');
      this.ui.showToast('No saved map config found');
      return;
    }

    const restoredPreset = applyCalibrationToPreset(
      this.calibrationPreset,
      calibrationSettingsFromPreset(entry.preset)
    );
    const restoredEntry = saveConfiguredSplatArenaPreset(restoredPreset, 'autosave');
    this.applyCalibrationPreset(restoredPreset);
    this.calibrationUi.show(
      restoredPreset,
      calibrationSettingsFromPreset(restoredPreset),
      this.calibrationBasePreset ?? restoredPreset
    );
    this.calibrationUi.setSaveInfo(restoredEntry ?? entry);
    this.calibrationUi.setFeedback(`Restored ${entry.reason} from ${formatHistoryTimestamp(entry.savedAt)}.`);
    this.ui.showToast(kind === 'last' ? 'Last map config restored' : 'Backup map config restored');
  }

  private async clearSavedCalibrationPreset(): Promise<void> {
    if (!this.calibrationPreset) return;
    const presetId = getSplatCalibrationStorageKey(this.calibrationPreset);
    clearConfiguredSplatArenaPreset(presetId);
    this.calibrationUi.setFeedback('Saved config cleared. Backups kept. Reloading default preset...');
    await this.switchCalibrationPreset(presetId, this.selectedSplatQuality);
  }

  private applyCalibrationPreset(preset: SplatArenaPreset): void {
    const settings = calibrationSettingsFromPreset(preset);
    this.calibrationPreset = preset;
    this.calibrationSettings = settings;
    this.calibrationSnapshot = makeCalibrationSnapshot(this.localName, settings.spawnPoints[0], settings.floorY);
    this.calibrationVelocityY = 0;
    this.aimYaw = this.calibrationSnapshot.rotY;
    this.aimPitch = 0;
    if (!this.calibrationController) {
      this.calibrationController = new LocalPlayerController(this.scene, true, 'A');
      this.calibrationController.setFirstPersonHidden(true);
      this.calibrationController.setName('Calibrator');
    }
    this.calibrationController.update(this.calibrationSnapshot, 1, true);
    disposeCalibrationGuide(this.scene, this.calibrationGuide);
    this.calibrationGuide = createCalibrationGuide(settings);
    this.scene.add(this.calibrationGuide);
    this.localPlayerBound = true;

    this.arenaRuntime?.dispose();
    this.arenaRuntime = createArenaProvider(SPLAT_TEST_ARENA_ID, { preset }).mount({
      scene: this.scene,
      renderer: this.renderer,
      shell: this.shell,
      camera: this.camera,
      onStatus: (message) => this.ui.showToast(message)
    });
    this.arenaRuntime.applyCalibration?.(settings);
  }

  private teleportCalibrationPlayer(index: number): void {
    if (!this.calibrationSnapshot || !this.calibrationSettings) return;
    const spawn = this.calibrationSettings.spawnPoints[index];
    if (!spawn) return;
    this.calibrationSnapshot.x = spawn.x;
    this.calibrationSnapshot.y = spawn.y;
    this.calibrationSnapshot.z = spawn.z;
    this.calibrationSnapshot.rotY = spawn.rotY;
    this.calibrationVelocityY = 0;
    this.aimYaw = spawn.rotY;
    this.aimPitch = 0;
    this.calibrationController?.update(this.calibrationSnapshot, 1, true);
    this.ui.showToast(`Moved to spawn ${String.fromCharCode(65 + index)}`);
  }

  private clearMatchScene(): void {
    this.vfx.reset();
    for (const controller of this.players.values()) {
      controller.dispose(this.scene);
    }
    this.players.clear();
    this.localControllerId = null;
    this.playerSnapshots.clear();
    this.projectileSnapshots = [];
    this.calibrationController?.dispose(this.scene);
    this.calibrationController = null;
    disposeCalibrationGuide(this.scene, this.calibrationGuide);
    this.calibrationGuide = null;
    this.calibrationSnapshot = null;
    this.calibrationBasePreset = null;
    this.calibrationPreset = null;
    this.calibrationSettings = null;
    this.calibrationVelocityY = 0;
    this.calibrationUi.hide();
    this.arenaRuntime?.dispose();
    this.arenaRuntime = null;
  }

  private getRequiredPlayers(): number {
    if (this.sceneMode === 'CALIBRATION') return 1;
    const state = this.network.room?.state as any;
    return Number(state?.requiredPlayers ?? (this.selectedMode === '2v2' ? 4 : 2));
  }

  private getArenaDebugInfo(): ArenaDebugInfo | null {
    if (this.arenaRuntime) return this.arenaRuntime.getDebugInfo();
    if (this.sceneMode === 'CALIBRATION' && this.calibrationPreset && this.calibrationSettings) {
      return {
        arenaId: SPLAT_TEST_ARENA_ID,
        splatUrl: this.calibrationPreset.splatUrl,
        splatFileSizeBytes: this.calibrationPreset.splatFileSizeBytes,
        splatLoadStatus: 'idle',
        collisionStatus: 'none',
        occlusionStatus: 'none',
        voxelCollisionStatus: this.calibrationPreset.voxelCollisionUrl ? 'loading' : 'none',
        voxelCollisionUrl: this.calibrationPreset.voxelCollisionUrl,
        collisionDebugVisible: false,
        scale: this.calibrationSettings.scale,
        rotation: { ...this.calibrationSettings.rotation },
        offset: { ...this.calibrationSettings.offset },
        floorY: this.calibrationSettings.floorY,
        bounds: { ...this.calibrationSettings.bounds },
        collisionWallCount: this.calibrationSettings.collisionWalls.length,
        collisionEraserCount: this.calibrationSettings.collisionErasers.length
      };
    }
    if (this.selectedArenaId === SPLAT_TEST_ARENA_ID) {
      return {
        arenaId: SPLAT_TEST_ARENA_ID,
        splatUrl: 'pending preset',
        splatLoadStatus: this.sceneMode === 'QUEUE' ? 'idle' : 'fallback',
        collisionStatus: 'none',
        occlusionStatus: 'none',
        voxelCollisionStatus: 'none',
        voxelCollisionUrl: null,
        collisionDebugVisible: false,
        scale: 1,
        rotation: { x: 0, y: 0, z: 0 },
        offset: { x: 0, y: 0, z: 0 },
        floorY: 0,
        bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
        collisionWallCount: 0,
        collisionEraserCount: 0
      };
    }
    return null;
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function defaultSplatCalibrationPreset(): SplatArenaPreset {
  return {
    presetId: 'businesspark-belp-1og-ost',
    calibrationGroupId: 'businesspark-belp-1og-ost',
    quality: 'high',
    arenaId: SPLAT_TEST_ARENA_ID,
    displayName: 'Businesspark Belp 1OG Ost',
    type: 'splat',
    splatUrl: '/splats/businesspark-belp-1og-ost.sog',
    splatFileSizeBytes: 14381152,
    enabledModes: ['1v1'],
    collisionMeshUrl: '/collision/businesspark-belp-1og-ost.collision.glb',
    voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json',
    spawnPoints: [
      { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
      { x: 6.1, y: 0, z: -0.9, rotY: 1.8 }
    ],
    spawnPointsByMode: {
      '1v1': [
        { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
        { x: 6.1, y: 0, z: -0.9, rotY: 1.8 }
      ],
      '2v2': [
        { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
        { x: 6.1, y: 0, z: -0.9, rotY: 1.8 },
        { x: -3.8, y: 0, z: 2.2, rotY: -1.4 },
        { x: 6.1, y: 0, z: -2.2, rotY: 1.8 }
      ]
    },
    bounds: { minX: -8, maxX: 11.1, minZ: -12, maxZ: 9.8 },
    scale: 1,
    rotation: { x: 180, y: 180, z: 0 },
    offset: { x: 0, y: 0, z: 0 },
    floorY: 0,
    collisionErasers: [],
    collisionWalls: []
  };
}

function makeCalibrationSnapshot(name: string, spawn: { x: number; y: number; z: number; rotY: number } | undefined, floorY: number): PlayerSnapshot {
  const resolvedSpawn = spawn ?? { x: 0, y: floorY, z: 0, rotY: 0 };
  return {
    id: 'calibration-local',
    name,
    teamId: 'A',
    x: resolvedSpawn.x,
    y: resolvedSpawn.y,
    z: resolvedSpawn.z,
    rotY: resolvedSpawn.rotY,
    hp: 100,
    mana: 100,
    anim: 'idle',
    casting: false,
    selectedSpell: ''
  };
}

function cloneCalibrationSettings(settings: SplatCalibrationSettings): SplatCalibrationSettings {
  return {
    scale: settings.scale,
    rotation: { ...settings.rotation },
    offset: { ...settings.offset },
    floorY: settings.floorY,
    bounds: { ...settings.bounds },
    enabledModes: [...settings.enabledModes],
    spawnPoints: settings.spawnPoints.map((spawn) => ({ ...spawn })),
    spawnPointsByMode: {
      '1v1': settings.spawnPointsByMode['1v1']?.map((spawn) => ({ ...spawn })),
      '2v2': settings.spawnPointsByMode['2v2']?.map((spawn) => ({ ...spawn }))
    },
    collisionErasers: settings.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: settings.collisionWalls.map((wall) => ({ ...wall }))
  };
}

function normalizeBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    maxX: Math.max(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxZ: Math.max(bounds.minZ, bounds.maxZ)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName) || element.isContentEditable;
}

function coerceArenaId(value: unknown): ArenaId {
  return value === SPLAT_TEST_ARENA_ID ? SPLAT_TEST_ARENA_ID : DEFAULT_ARENA_ID;
}

function resolveCharacterClass(value: unknown): CharacterClass {
  return typeof value === 'string' && isCharacterClass(value) ? value : 'arcanist';
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function resolveServerUrl(): string {
  const envUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
  if (envUrl) return envUrl;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (['5173', '4173', '4174'].includes(location.port)) {
    return `${protocol}//${location.hostname}:3001`;
  }
  return `${protocol}//${location.host}`;
}

function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function loadLatestCompatibleHistoryEntry(preset: SplatArenaPreset): SplatPresetHistoryEntry | null {
  return compatibleHistoryEntry(preset, loadLatestSplatPresetHistoryEntry(getSplatCalibrationStorageKey(preset)));
}

function loadLatestCompatibleBackupEntry(preset: SplatArenaPreset): SplatPresetHistoryEntry | null {
  return compatibleHistoryEntry(preset, loadLatestSplatPresetBackupEntry(getSplatCalibrationStorageKey(preset)));
}

function compatibleHistoryEntry(
  preset: SplatArenaPreset,
  entry: SplatPresetHistoryEntry | null
): SplatPresetHistoryEntry | null {
  return entry && splatPresetIsCompatibleWithBase(preset, entry.preset) ? entry : null;
}

function normalizeSplatQualityParam(value: string | null): SplatQuality | undefined {
  return value === 'low' || value === 'mid' || value === 'high' ? value : undefined;
}

async function detectGeneratedCollisionUrls(preset: SplatArenaPreset): Promise<{ collisionMeshUrl: string | null; voxelCollisionUrl: string | null }> {
  const arenaId = collisionAssetIdFromPreset(preset);
  const voxelCollisionUrl = `/collision/${arenaId}.voxel.json`;
  const voxelBinUrl = `/collision/${arenaId}.voxel.bin`;
  const collisionMeshUrl = `/collision/${arenaId}.collision.glb`;
  const [hasVoxelJson, hasVoxelBin, hasGlb] = await Promise.all([
    assetExists(voxelCollisionUrl),
    assetExists(voxelBinUrl),
    assetExists(collisionMeshUrl)
  ]);
  return {
    voxelCollisionUrl: hasVoxelJson && hasVoxelBin ? voxelCollisionUrl : null,
    collisionMeshUrl: hasGlb ? collisionMeshUrl : null
  };
}

async function assetExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const contentType = response.headers.get('content-type') ?? '';
    return response.ok && !contentType.includes('text/html');
  } catch {
    return false;
  }
}

function collisionAssetIdFromPreset(preset: Pick<SplatArenaPreset, 'presetId' | 'calibrationGroupId'>): string {
  return sanitizeAssetId(preset.calibrationGroupId ?? preset.presetId);
}

function sanitizeAssetId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'splat-arena';
}

function splatFilenameFromUrl(url: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(url, location.origin).pathname);
    return pathname.startsWith('/splats/') && pathname.endsWith('.sog')
      ? pathname.slice('/splats/'.length)
      : null;
  } catch {
    return null;
  }
}

function createCalibrationGuide(settings: SplatCalibrationSettings): THREE.Group {
  const group = new THREE.Group();
  group.name = 'splat-calibration-floor-bounds-guide';

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  floor.name = 'calibration-floor-reference';
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const grid = new THREE.GridHelper(1, 20, 0xf5c45e, 0x38bdf8);
  grid.name = 'calibration-floor-grid';
  const gridMaterial = grid.material as THREE.Material | THREE.Material[];
  for (const material of Array.isArray(gridMaterial) ? gridMaterial : [gridMaterial]) {
    material.transparent = true;
    material.opacity = 0.42;
    material.depthWrite = false;
  }
  group.add(grid);

  const bounds = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xf5c45e, transparent: true, opacity: 0.95 })
  );
  bounds.name = 'calibration-bounds-rectangle';
  group.add(bounds);

  const spawnA = createSpawnMarker(0xff6b35, 'calibration-spawn-a');
  const spawnB = createSpawnMarker(0x7dd3fc, 'calibration-spawn-b');
  const spawnC = createSpawnMarker(0xf5c45e, 'calibration-spawn-c');
  const spawnD = createSpawnMarker(0x22c55e, 'calibration-spawn-d');
  group.add(spawnA, spawnB, spawnC, spawnD);

  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'calibration-invisible-wall-guides';
  group.add(wallsGroup);

  const erasersGroup = new THREE.Group();
  erasersGroup.name = 'calibration-voxel-eraser-guides';
  group.add(erasersGroup);

  group.userData.floor = floor;
  group.userData.grid = grid;
  group.userData.bounds = bounds;
  group.userData.spawnA = spawnA;
  group.userData.spawnB = spawnB;
  group.userData.spawnC = spawnC;
  group.userData.spawnD = spawnD;
  group.userData.wallsGroup = wallsGroup;
  group.userData.erasersGroup = erasersGroup;
  updateCalibrationGuide(group, settings);
  return group;
}

function updateCalibrationGuide(group: THREE.Group | null, settings: SplatCalibrationSettings): void {
  if (!group) return;
  const normalized = normalizeBounds(settings.bounds);
  const width = Math.max(0.01, normalized.maxX - normalized.minX);
  const depth = Math.max(0.01, normalized.maxZ - normalized.minZ);
  const centerX = (normalized.minX + normalized.maxX) / 2;
  const centerZ = (normalized.minZ + normalized.maxZ) / 2;
  const floorY = settings.floorY;

  const floor = group.userData.floor as THREE.Mesh | undefined;
  if (floor) {
    floor.position.set(centerX, floorY + 0.01, centerZ);
    floor.scale.set(width, depth, 1);
  }

  const grid = group.userData.grid as THREE.GridHelper | undefined;
  if (grid) {
    grid.position.set(centerX, floorY + 0.02, centerZ);
    grid.scale.set(width, 1, depth);
  }

  const bounds = group.userData.bounds as THREE.LineSegments | undefined;
  if (bounds) {
    const positions = new Float32Array([
      normalized.minX, floorY + 0.06, normalized.minZ, normalized.maxX, floorY + 0.06, normalized.minZ,
      normalized.maxX, floorY + 0.06, normalized.minZ, normalized.maxX, floorY + 0.06, normalized.maxZ,
      normalized.maxX, floorY + 0.06, normalized.maxZ, normalized.minX, floorY + 0.06, normalized.maxZ,
      normalized.minX, floorY + 0.06, normalized.maxZ, normalized.minX, floorY + 0.06, normalized.minZ
    ]);
    bounds.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    bounds.geometry.computeBoundingSphere();
  }

  updateSpawnMarker(group.userData.spawnA as THREE.Group | undefined, settings.spawnPoints[0], floorY);
  updateSpawnMarker(group.userData.spawnB as THREE.Group | undefined, settings.spawnPoints[1], floorY);
  updateSpawnMarker(group.userData.spawnC as THREE.Group | undefined, settings.spawnPoints[2], floorY);
  updateSpawnMarker(group.userData.spawnD as THREE.Group | undefined, settings.spawnPoints[3], floorY);
  updateWallGuides(group.userData.wallsGroup as THREE.Group | undefined, settings);
  updateEraserGuides(group.userData.erasersGroup as THREE.Group | undefined, settings);
}

function createSpawnMarker(color: number, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.38, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.06, 0), 0.8, color, 0.22, 0.14);
  arrow.name = 'spawn-direction';
  group.add(arrow);
  return group;
}

function updateSpawnMarker(
  marker: THREE.Group | undefined,
  spawn: { x: number; y: number; z: number; rotY: number } | undefined,
  floorY: number
): void {
  if (!marker) return;
  if (!spawn) {
    marker.visible = false;
    return;
  }
  marker.visible = true;
  marker.position.set(spawn.x, floorY + 0.07, spawn.z);
  const arrow = marker.getObjectByName('spawn-direction') as THREE.ArrowHelper | undefined;
  arrow?.setDirection(new THREE.Vector3(-Math.sin(spawn.rotY), 0, -Math.cos(spawn.rotY)).normalize());
}

function updateWallGuides(wallsGroup: THREE.Group | undefined, settings: SplatCalibrationSettings): void {
  if (!wallsGroup) return;
  while (wallsGroup.children.length < settings.collisionWalls.length) {
    wallsGroup.add(createWallGuide());
  }
  while (wallsGroup.children.length > settings.collisionWalls.length) {
    const removed = wallsGroup.children.pop();
    if (removed) disposeCalibrationObject(removed);
  }

  settings.collisionWalls.forEach((wall, index) => {
    const guide = wallsGroup.children[index] as THREE.Group | undefined;
    if (!guide) return;
    const height = Math.max(0.1, wall.height);
    guide.name = `calibration-wall-${wall.id}`;
    guide.position.set(wall.x, settings.floorY + height / 2, wall.z);
    guide.rotation.y = wall.rotY;
    guide.visible = true;
    updateWallGuideVisual(
      guide,
      Math.max(0.1, wall.width),
      Math.max(0.1, wall.depth),
      height,
      Boolean(wall.climbable)
    );
  });
}

function updateEraserGuides(erasersGroup: THREE.Group | undefined, settings: SplatCalibrationSettings): void {
  if (!erasersGroup) return;
  while (erasersGroup.children.length < settings.collisionErasers.length) {
    erasersGroup.add(createEraserGuide());
  }
  while (erasersGroup.children.length > settings.collisionErasers.length) {
    const removed = erasersGroup.children.pop();
    if (removed) disposeCalibrationObject(removed);
  }

  settings.collisionErasers.forEach((eraser, index) => {
    const guide = erasersGroup.children[index] as THREE.Group | undefined;
    if (!guide) return;
    const height = Math.max(0.1, eraser.height);
    guide.name = `calibration-eraser-${eraser.id}`;
    guide.position.set(eraser.x, settings.floorY + height / 2, eraser.z);
    guide.rotation.y = eraser.rotY;
    guide.visible = true;
    updateWallGuideVisual(
      guide,
      Math.max(0.1, eraser.width),
      Math.max(0.1, eraser.depth),
      height,
      false,
      0x22c55e
    );
  });
}

function createWallGuide(): THREE.Group {
  const group = new THREE.Group();
  group.userData.kind = 'calibration-wall-guide';

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      wireframe: true
    })
  );
  box.name = 'wall-box';
  const rungs = new THREE.Group();
  rungs.name = 'ladder-rungs';
  group.add(box, rungs);
  group.userData.box = box;
  group.userData.rungs = rungs;
  return group;
}

function createEraserGuide(): THREE.Group {
  const group = createWallGuide();
  group.userData.kind = 'calibration-eraser-guide';
  return group;
}

function updateWallGuideVisual(group: THREE.Group, width: number, depth: number, height: number, climbable: boolean, overrideColor?: number): void {
  const box = group.userData.box as THREE.Mesh | undefined;
  if (box) {
    box.scale.set(width, height, depth);
    const material = box.material as THREE.MeshBasicMaterial;
    material.color.setHex(overrideColor ?? (climbable ? 0x38bdf8 : 0xff4d6d));
    material.opacity = overrideColor ? 0.34 : climbable ? 0.42 : 0.28;
  }

  const rungs = group.userData.rungs as THREE.Group | undefined;
  if (!rungs) return;
  rungs.visible = climbable;
  const rungCount = climbable ? Math.max(2, Math.floor(height / 0.35)) : 0;
  while (rungs.children.length < rungCount) {
    rungs.add(createLadderRung());
  }
  while (rungs.children.length > rungCount) {
    const removed = rungs.children.pop();
    if (removed) disposeCalibrationObject(removed);
  }
  rungs.children.forEach((rung, index) => {
    const mesh = rung as THREE.Mesh;
    mesh.scale.set(Math.max(0.3, width * 0.72), 0.035, 0.07);
    mesh.position.set(0, -height / 2 + ((index + 1) * height) / (rungCount + 1), depth / 2 + 0.08);
  });
}

function createLadderRung(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xf5c45e,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    })
  );
}

function disposeCalibrationGuide(scene: THREE.Scene, guide: THREE.Group | null): void {
  if (!guide) return;
  scene.remove(guide);
  disposeCalibrationObject(guide);
}

function disposeCalibrationObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}
