import Phaser from "phaser";
import { GAME_RENDER_CONFIG } from "./renderConfig";

export { GAME_CAMERA_CONFIG, GAME_RENDER_CONFIG } from "./renderConfig";

export function applySmoothTextureSampling(game: Phaser.Game): void {
  for (const texture of Object.values(game.textures.list)) {
    const sourceImages = texture.getSourceImage();
    const sources = Array.isArray(sourceImages) ? sourceImages : [sourceImages];
    for (const source of sources) {
      if (!source) {
        continue;
      }
      const image = source as Phaser.Textures.TextureSource | HTMLImageElement | HTMLCanvasElement;
      if (typeof (image as Phaser.Textures.TextureSource).setFilter === "function") {
        (image as Phaser.Textures.TextureSource).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }
  }
}
