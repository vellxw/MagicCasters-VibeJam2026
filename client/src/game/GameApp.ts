import * as THREE from 'three';
import { SPELL_IDS, type SpellId } from '../../../shared/spells';
import type { MoveInput } from '../../../shared/types';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { NetworkClient } from '../network/NetworkClient';
import { LocalPlayerController, type PlayerSnapshot } from '../player/LocalPlayerController';
import { RemotePlayerController } from '../player/RemotePlayerController';
import { SpellVfxManager } from '../spells/SpellVfxManager';
import { DebugOverlay } from '../ui/DebugOverlay';
import { VoiceCommandManager } from '../voice/VoiceCommandManager';
import { buildArena } from '../world/Arena';

interface ProjectileSnapshot {
  id: string;
  spellId: SpellId;
  x: number;
  y: number;
  z: number;
}

export class GameApp {
  private shell: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
  private clock = new THREE.Clock();
  private cameraRig = new ThirdPersonCamera();
  private vfx = new SpellVfxManager(this.scene);
  private ui: DebugOverlay;
  private voice = new VoiceCommandManager();
  private network: NetworkClient;
  private players = new Map<string, LocalPlayerController | RemotePlayerController>();
  private playerSnapshots = new Map<string, PlayerSnapshot>();
  private projectileSnapshots: ProjectileSnapshot[] = [];
  private keys = new Set<string>();
  private localName = `Mage ${Math.floor(Math.random() * 900 + 100)}`;
  private aimYaw = 0;
  private phase = 'WAITING';
  private localControllerId: string | null = null;
  private localPlayerBound = false;
  private controlsEnabled = false;
  private lastMoveSent = 0;
  private animationId = 0;

  constructor(private root: HTMLElement) {
    this.shell = document.createElement('div');
    this.shell.className = 'game-shell';
    this.root.appendChild(this.shell);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0x15120f);
    this.shell.appendChild(this.renderer.domElement);

    this.ui = new DebugOverlay(this.root);
    this.network = new NetworkClient(resolveServerUrl());
  }

  start(): void {
    this.setupScene();
    this.bindEvents();
    this.connect();
    this.loop();
  }

  private setupScene(): void {
    this.scene.fog = new THREE.Fog(0x15120f, 16, 42);
    this.scene.add(new THREE.HemisphereLight(0xf7e7c6, 0x1f2618, 2.2));

    const key = new THREE.DirectionalLight(0xffd391, 2.4);
    key.position.set(-4, 8, 5);
    key.castShadow = true;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    this.scene.add(key);

    const frost = new THREE.PointLight(0x7dd3fc, 12, 12);
    frost.position.set(5, 3, -4);
    this.scene.add(frost);

    const ember = new THREE.PointLight(0xff6b35, 10, 10);
    ember.position.set(-5, 2.6, 4);
    this.scene.add(ember);

    buildArena(this.scene);
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
      }
    });

    this.ui.onCast = (spellId) => this.cast(spellId);
    this.ui.onVoiceToggle = () => this.voice.toggle();
    this.voice.onSpell = (spellId, raw) => {
      this.ui.showToast(raw.trim());
      this.cast(spellId);
    };
    this.voice.onStatus = (message) => this.ui.showToast(message);

    this.network.onState = (state) => this.applyState(state);
    this.network.onEvent = (type, payload) => this.handleNetEvent(type, payload);
  }

  private async connect(): Promise<void> {
    try {
      await this.network.connect(this.localName);
      this.ui.showToast('Room joined');
    } catch (error) {
      this.ui.showToast('Server offline');
      console.error(error);
    }
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
      event.preventDefault();
      if (down) this.keys.add(key);
      else this.keys.delete(key);
    }

    if (!down || event.repeat) return;
    const spell = SPELL_IDS.find((id) => event.key === String(SPELL_IDS.indexOf(id) + 1));
    if (spell) {
      event.preventDefault();
      this.cast(spell);
    }
  }

  private cast(spellId: SpellId): void {
    this.network.cast(spellId);
  }

  private applyState(state: any): void {
    this.phase = state.phase ?? this.phase;
    this.playerSnapshots.clear();
    const players = Array.from(state.players?.values?.() ?? []) as PlayerSnapshot[];
    const activeIds = new Set<string>();

    for (const player of players) {
      activeIds.add(player.id);
      this.playerSnapshots.set(player.id, player);
      this.ensurePlayerController(player);
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
  }

  private handleNetEvent(type: string, payload: any): void {
    if (type === 'phase') {
      this.phase = payload.phase;
      this.syncControlState();
      if (payload.message) this.ui.showToast(payload.message);
    }
    if (type === 'spell_confirmed') {
      this.vfx.confirmSpell(payload.spellId, payload.x, payload.y, payload.z);
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

    for (const [id, snapshot] of this.playerSnapshots) {
      const controller = this.players.get(id);
      controller?.update(snapshot, dt, id === this.network.localSessionId);
    }

    const local = this.getLocalSnapshot();
    if (local) {
      this.cameraRig.update(this.camera, new THREE.Vector3(local.x, local.y, local.z), this.aimYaw, dt);
    }

    this.sendMoveIfNeeded();
    this.vfx.update(dt);
    this.ui.update({
      phase: this.phase,
      status: this.network.status,
      roomId: (this.network.room as any)?.id ?? (this.network.room as any)?.roomId ?? '',
      local,
      playerCount: this.playerSnapshots.size,
      projectileCount: this.projectileSnapshots.length,
      voiceActive: this.voice.active,
      voiceText: this.voice.transcript,
      localSessionId: this.network.localSessionId,
      localPlayerBound: this.localPlayerBound,
      controlsEnabled: this.controlsEnabled
    });
    this.renderer.render(this.scene, this.camera);
  }

  private sendMoveIfNeeded(): void {
    const now = performance.now();
    if (now - this.lastMoveSent < 50) return;
    this.lastMoveSent = now;

    if (!this.controlsEnabled) return;

    const input: MoveInput = {
      forward: this.keys.has('w') || this.keys.has('arrowup'),
      backward: this.keys.has('s') || this.keys.has('arrowdown'),
      left: this.keys.has('a') || this.keys.has('arrowleft'),
      right: this.keys.has('d') || this.keys.has('arrowright'),
      rotY: this.aimYaw
    };
    this.network.sendMove(input);
  }

  private getLocalSnapshot(): PlayerSnapshot | undefined {
    const id = this.network.localSessionId;
    return id ? this.playerSnapshots.get(id) : undefined;
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

    const controller = shouldBeLocal
      ? new LocalPlayerController(this.scene, true)
      : new RemotePlayerController(this.scene, false);
    controller.setName(player.name);
    this.players.set(player.id, controller);

    if (shouldBeLocal) {
      this.localControllerId = player.id;
    } else if (isCurrentLocal) {
      this.localControllerId = null;
    }
  }

  private syncControlState(): void {
    this.localPlayerBound = Boolean(this.getLocalSnapshot());
    this.controlsEnabled = this.network.connected && this.localPlayerBound && this.phase === 'PLAYING';

    if (!this.controlsEnabled) {
      this.keys.clear();
    }
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function resolveServerUrl(): string {
  const envUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
  if (envUrl) return envUrl;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (location.port === '5173') {
    return `${protocol}//${location.hostname}:3001`;
  }
  return `${protocol}//${location.host}`;
}
