declare module "papaparse" {
  type ParseError = { message: string }
  type ParseResult<T> = {
    data: T[]
    errors: ParseError[]
    meta: { fields?: string[] }
  }
  type ParseConfig<T> = {
    header?: boolean
    skipEmptyLines?: boolean
    complete?: (results: ParseResult<T>) => void
    error?: (error: Error) => void
  }
  const Papa: {
    parse<T>(input: File | string, config: ParseConfig<T>): void
    unparse(input: unknown): string
  }
  export default Papa
}
