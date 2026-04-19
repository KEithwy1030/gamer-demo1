const DEFAULT_WORLD_SIZE = 4800;
export class MatchRuntimeStore {
    state = {
        code: "",
        width: DEFAULT_WORLD_SIZE,
        height: DEFAULT_WORLD_SIZE,
        startedAt: 0,
        selfPlayerId: null,
        players: [],
        monsters: [],
        drops: [],
        secondsRemaining: null,
        inventory: null,
        lastCombatText: null
    };
    listeners = new Set();
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.getState());
        return () => {
            this.listeners.delete(listener);
        };
    }
    setBootstrap(bootstrap) {
        this.state = {
            ...this.state,
            code: bootstrap.snapshot.code,
            width: bootstrap.snapshot.width || DEFAULT_WORLD_SIZE,
            height: bootstrap.snapshot.height || DEFAULT_WORLD_SIZE,
            startedAt: bootstrap.snapshot.startedAt,
            selfPlayerId: bootstrap.selfPlayerId,
            players: bootstrap.snapshot.players.slice(),
            monsters: [],
            drops: [],
            inventory: null,
            lastCombatText: null
        };
        this.emit();
    }
    updatePlayers(players) {
        this.state = {
            ...this.state,
            players: players.slice()
        };
        this.emit();
    }
    updateMonsters(monsters) {
        this.state = {
            ...this.state,
            monsters: monsters.slice()
        };
        this.emit();
    }
    updateDrops(drops) {
        this.state = {
            ...this.state,
            drops: drops.slice()
        };
        this.emit();
    }
    setTimer(secondsRemaining) {
        this.state = {
            ...this.state,
            secondsRemaining
        };
        this.emit();
    }
    setInventory(inventory) {
        this.state = {
            ...this.state,
            inventory: cloneInventory(inventory)
        };
        this.emit();
    }
    setCombatText(text) {
        this.state = {
            ...this.state,
            lastCombatText: text
        };
        this.emit();
    }
    getState() {
        return {
            ...this.state,
            players: this.state.players.slice(),
            monsters: this.state.monsters.slice(),
            drops: this.state.drops.slice(),
            inventory: this.state.inventory ? cloneInventory(this.state.inventory) : null
        };
    }
    emit() {
        const snapshot = this.getState();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}
function cloneInventory(inventory) {
    const equipment = {};
    for (const [slot, item] of Object.entries(inventory.equipment)) {
        if (item) {
            equipment[slot] = { ...item };
        }
    }
    return {
        width: inventory.width,
        height: inventory.height,
        items: inventory.items.map((item) => ({ ...item })),
        equipment
    };
}
