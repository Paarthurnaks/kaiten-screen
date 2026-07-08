import { DomainValidationError } from "../errors";

/**
 * Прямоугольная область экрана, выбранная пользователем в overlay захвата.
 * Координаты — в пикселях, в системе координат экрана (могут быть за пределами
 * основного монитора при мультимониторной конфигурации).
 */
export class CaptureRegion {
  private constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number,
  ) {}

  static create(x: number, y: number, width: number, height: number): CaptureRegion {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new DomainValidationError("CaptureRegion: x/y должны быть конечными числами");
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new DomainValidationError("CaptureRegion: width/height должны быть положительными числами");
    }
    return new CaptureRegion(x, y, width, height);
  }
}
