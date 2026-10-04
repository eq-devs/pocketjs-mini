#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-parameter"
#include "quickjs.h"
#pragma clang diagnostic pop
#include <stdint.h>
#include <time.h>

/* These limits cover the guest heap, not Rust textures or the host process.
 * The portable adapter is still singleton; move this deadline into instance
 * ownership when introducing independent native runtime handles.
 */
static uint64_t deadline;
static JSContext *active_context;
static uint64_t monotonic_ns(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return UINT64_MAX;
  return (uint64_t)now.tv_sec * 1000000000ull + (uint64_t)now.tv_nsec;
}
static int interrupt_guest(JSRuntime *runtime, void *opaque) {
  (void)runtime; (void)opaque;
  return monotonic_ns() >= deadline;
}
JSRuntime *pjm_new_runtime(void) {
  JSRuntime *runtime = JS_NewRuntime();
  if (runtime) {
    JS_SetMemoryLimit(runtime, 24 * 1024 * 1024);
    JS_SetMaxStackSize(runtime, 256 * 1024);
    JS_SetInterruptHandler(runtime, interrupt_guest, NULL);
  }
  return runtime;
}
JSValue pjm_eval(JSContext *context, const char *code, size_t length, const char *name, int flags) {
  active_context = context;
  deadline = monotonic_ns() + 2000000000ull;
  return JS_Eval(context, code, length, name, flags);
}
JSValue pjm_call(JSContext *context, JSValueConst function, JSValueConst receiver, int count, JSValueConst *arguments) {
  active_context = context;
  deadline = monotonic_ns() + 50000000ull;
  return JS_Call(context, function, receiver, count, arguments);
}
int pjm_execute_pending_job(JSRuntime *runtime, JSContext **context) {
  // Check between jobs as well: a chain of tiny Promise jobs must not evade
  // the bytecode interrupt check by returning before its instruction interval.
  if (JS_IsJobPending(runtime) && monotonic_ns() >= deadline) {
    *context = active_context;
    JS_ThrowInternalError(active_context, "guest execution deadline exceeded");
    return -1;
  }
  return JS_ExecutePendingJob(runtime, context);
}
