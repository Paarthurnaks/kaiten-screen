import type { KaitenBoard, KaitenClient, KaitenLane, KaitenSpace } from "../domain/ports/kaiten-client";
import type { Logger } from "../domain/ports/logger";

/** Use-case для формы задачи/настроек: списки пространств/досок/дорожек Kaiten. */
export class ListKaitenOptions {
  constructor(
    private readonly kaiten: KaitenClient,
    private readonly logger: Logger,
  ) {}

  async listSpaces(): Promise<KaitenSpace[]> {
    this.logger.debug("ListKaitenOptions.listSpaces", "requested");
    return this.kaiten.listSpaces();
  }

  async listBoards(spaceId: string): Promise<KaitenBoard[]> {
    this.logger.debug("ListKaitenOptions.listBoards", "requested", { spaceId });
    return this.kaiten.listBoards(spaceId);
  }

  async listLanes(boardId: string): Promise<KaitenLane[]> {
    this.logger.debug("ListKaitenOptions.listLanes", "requested", { boardId });
    return this.kaiten.listLanes(boardId);
  }
}
