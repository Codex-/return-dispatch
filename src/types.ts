export type Result<T> = ResultSuccess<T> | ResultTimeout | ResultInvalidInput;

interface ResultSuccess<T> {
  success: true;
  value: T;
}

interface ResultTimeout {
  success: false;
  reason: "timeout";
}

interface ResultInvalidInput {
  success: false;
  reason: "invalid input";
}
