export type Result<T> = ResultSuccess<T> | ResultTimeout;

interface ResultSuccess<T> {
  success: true;
  value: T;
}

interface ResultTimeout {
  success: false;
  reason: "timeout";
}
