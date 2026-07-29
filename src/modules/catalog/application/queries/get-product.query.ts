export class GetProductQuery {
  constructor(
    public readonly id: string,
    public readonly includeInactive = false,
  ) {}
}
