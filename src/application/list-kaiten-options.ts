import type {
  KaitenBoard,
  KaitenClient,
  KaitenColumn,
  KaitenCustomProperty,
  KaitenLane,
  KaitenSearchCard,
  KaitenSpace,
  KaitenUser,
} from "../domain/ports/kaiten-client";
import type { Logger } from "../domain/ports/logger";

/** Use-case для формы задачи/настроек: списки пространств/досок/колонок/дорожек/пользователей
 * Kaiten и связанных справочников (пользовательские поля, поиск карточек). */
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

  async listColumns(boardId: string): Promise<KaitenColumn[]> {
    this.logger.debug("ListKaitenOptions.listColumns", "requested", { boardId });
    return this.kaiten.listColumns(boardId);
  }

  async listLanes(boardId: string): Promise<KaitenLane[]> {
    this.logger.debug("ListKaitenOptions.listLanes", "requested", { boardId });
    return this.kaiten.listLanes(boardId);
  }

  async listUsers(): Promise<KaitenUser[]> {
    this.logger.debug("ListKaitenOptions.listUsers", "requested");
    return this.kaiten.listUsers();
  }

  async listCustomProperties(): Promise<KaitenCustomProperty[]> {
    this.logger.debug("ListKaitenOptions.listCustomProperties", "requested");
    return this.kaiten.listCustomProperties();
  }

  async searchCards(query: string): Promise<KaitenSearchCard[]> {
    this.logger.debug("ListKaitenOptions.searchCards", "requested", { query });
    return this.kaiten.searchCards(query);
  }
}
