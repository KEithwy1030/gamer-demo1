import Phaser from "phaser";
function readAxis(positivePrimary, positiveAlt, negativePrimary, negativeAlt) {
    return Number(positivePrimary.isDown || positiveAlt.isDown) - Number(negativePrimary.isDown || negativeAlt.isDown);
}
export function createKeyboardControls(keyboard) {
    const keys = keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,E,F,I,B,TAB");
    return {
        destroy() {
            // Phaser owns the key instances. We only keep lightweight references.
        },
        getVector() {
            return {
                x: readAxis(keys.D, keys.RIGHT, keys.A, keys.LEFT),
                y: readAxis(keys.S, keys.DOWN, keys.W, keys.UP)
            };
        },
        consumeActions(handlers) {
            if (Phaser.Input.Keyboard.JustDown(keys.SPACE)) {
                handlers.onAttack?.();
            }
            if (Phaser.Input.Keyboard.JustDown(keys.Q)) {
                handlers.onSkill?.();
            }
            if (Phaser.Input.Keyboard.JustDown(keys.E)) {
                handlers.onPickup?.();
            }
            if (Phaser.Input.Keyboard.JustDown(keys.F)) {
                handlers.onExtract?.();
            }
            if (Phaser.Input.Keyboard.JustDown(keys.I)
                || Phaser.Input.Keyboard.JustDown(keys.B)
                || Phaser.Input.Keyboard.JustDown(keys.TAB)) {
                handlers.onInventory?.();
            }
        }
    };
}
