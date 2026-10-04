#ifndef PJM_RUNTIME_POLICY_H
#define PJM_RUNTIME_POLICY_H
#include "quickjs.h"
JSRuntime *pjm_new_runtime(void);
JSValue pjm_eval(JSContext *, const char *, size_t, const char *, int);
JSValue pjm_call(JSContext *, JSValueConst, JSValueConst, int, JSValueConst *);
int pjm_execute_pending_job(JSRuntime *, JSContext **);
/* Injected only into the unchanged portable adapter, never QuickJS itself. */
#define JS_NewRuntime pjm_new_runtime
#define JS_Eval pjm_eval
#define JS_Call pjm_call
#define JS_ExecutePendingJob pjm_execute_pending_job
#endif
