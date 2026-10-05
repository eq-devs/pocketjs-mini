#ifndef MINI_CORE_H
#define MINI_CORE_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Engine composition ABI v1. Caller owns valid pointers and uses one owner
 * thread per handle. GPU surface binding remains a separate host integration.
 * Packed contacts are the pinned PocketJS snapshot contract, up to 8 words.
 * No retained-state reload: create a fresh instance for every restart. */
typedef struct MpInstance MpInstance;
typedef struct { uint32_t size,abi,width,height,density,heap_bytes,target; } MpConfig;
/* target: 1 = pjm-ios, 2 = pjm-android; pixels: little-endian BGRA.
 * Pixel memory is borrowed until the next render or destroy on this handle. */
typedef struct { const uint8_t *pixels; size_t length; uint32_t width,height,stride; } MpFrame;
uint32_t mp_abi_version(void);
/* Structural selection after host signature verification of the WHOLE payload.
 * expected identity is from verified metadata. All slices borrow payload until
 * its owner releases it. JS excludes its terminating NUL. Checks footer/target/
 * ABI/embedded identity; caller must additionally admit the returned build plan.
 * Initialize size to sizeof(MpPackageInputs). Failure clears returned slices. */
typedef struct { uint32_t size; const uint8_t *js; size_t js_len; const uint8_t *pak; size_t pak_len; const uint8_t *plan; size_t plan_len; } MpPackageInputs;
int32_t mp_package_select(const uint8_t *payload,size_t length,uint32_t target,const uint8_t *identity,size_t identity_len,MpPackageInputs *output);
MpInstance *mp_create(const MpConfig *config);
int32_t mp_boot(MpInstance*,const uint8_t *js,size_t js_len,const uint8_t *pak,size_t pak_len);
int32_t mp_frame(MpInstance*,const uint32_t *contacts,size_t count);
/* Host latches the initial hit on the owner thread. Active packed contacts
 * exclude cancellation markers; cancelled IDs are appended as terminal records.
 * A quick tap must remain active for one sample before its release. */
typedef struct {
  uint32_t size,count,contacts[8];
  int32_t hits[8];
  uint32_t cancelled_count;
  uint8_t cancelled[8];
} MpInput;
int32_t mp_frame_input(MpInstance*,const MpInput*);
/* Logical coordinates; status is separate from the returned node ID. */
int32_t mp_hit_test(MpInstance*,float x,float y,int32_t *output);
int32_t mp_render(MpInstance*,MpFrame *out);
/* Physical-pixel x,y,width,height regions for the persistent framebuffer.
 * Initialize size. First frame/full fallback covers the entire framebuffer;
 * count zero means unchanged pixels. A new/lost GPU texture requires uploading
 * the complete framebuffer even when damage is empty. */
typedef struct { uint32_t size,full_redraw,count,regions[8][4]; } MpDamage;
int32_t mp_render_damage(MpInstance*,MpFrame *out,MpDamage *damage);
/* Whole newline-terminated records. -1 leaves an undersized record queued. */
ptrdiff_t mp_svc_take(MpInstance*,uint8_t *output,size_t capacity);
int32_t mp_svc_post(MpInstance*,const uint8_t *line,size_t length);
const char *mp_last_error(MpInstance*);
/* Read-only development retained-tree JSON; max capacity 4 MiB.
 * Returns byte length or -1; caller initializes its own bounded output buffer. */
ptrdiff_t mp_debug_tree(MpInstance*,uint8_t *output,size_t capacity);
/* Owner-thread, idempotent for a healthy booted guest. Suspension blocks
 * guest frames/effect draining; bounded completions remain queued for resume.
 * A failed/stopped guest cannot be revived. */
int32_t mp_suspend(MpInstance*);
int32_t mp_resume(MpInstance*);
/* Optional SDK hook at an owner-thread boundary, bounded like a frame.
 * Host orders contact cancellation/hide before suspend, show after resume,
 * and unload before its final cleanup frame and GPU/resource release. */
enum { MP_LAUNCH=1, MP_SHOW=2, MP_HIDE=3, MP_UNLOAD=4, MP_MEMORY_WARNING=5 };
int32_t mp_lifecycle(MpInstance*,uint32_t event);
/* UTF-8 JSON launch data, <=4096 bytes. Called once after successful boot. */
int32_t mp_launch(MpInstance*,const uint8_t *data,size_t length);
int32_t mp_destroy(MpInstance*);
/* Retained engine policy: caller authenticates packages/identity before activation.
 * All operations use one owner thread. GPU resources remain host-owned. Borrowed
 * frame pixels become invalid on activation, eviction or destruction.
 * Same-pool reentry is rejected with the operation's failure sentinel without
 * updating last_error; last_error itself returns NULL during an active call. */
typedef struct MpPool MpPool;
/* Synchronous after the final guest turn, before realm destruction. Up to 32
 * records per guest. Callback must not reenter the pool or retain borrowed
 * pointers. Store effects use this identity; no further guest frame is run. */
typedef void (*MpPoolCleanup)(void *context,const uint8_t *id,size_t id_len,uint64_t generation,const uint8_t *line,size_t length);
int32_t mp_pool_set_cleanup(MpPool*,MpPoolCleanup,void *context);
/* Owner-thread callback after cleanup and before engine release. No reentry. */
typedef void (*MpPoolRetirement)(void *context,const uint8_t *id,size_t id_len,uint64_t generation);
int32_t mp_pool_set_retirement(MpPool*,MpPoolRetirement,void *context);
int32_t mp_pool_close(MpPool*,const uint8_t *id,size_t id_len);
MpPool *mp_pool_create(uint32_t capacity);
int32_t mp_pool_activate(MpPool*,const uint8_t *id,size_t id_len,const MpConfig*,const uint8_t *js,size_t js_len,const uint8_t *pak,size_t pak_len,const uint8_t *launch,size_t launch_len);
int32_t mp_pool_frame(MpPool*,const uint32_t *contacts,size_t count);
int32_t mp_pool_render(MpPool*,MpFrame*);
int32_t mp_pool_frame_input(MpPool*,const MpInput*);
int32_t mp_pool_hit_test(MpPool*,float x,float y,int32_t *output);
int32_t mp_pool_render_damage(MpPool*,MpFrame*,MpDamage*);
ptrdiff_t mp_pool_svc_take(MpPool*,uint8_t *output,size_t capacity);
/* Completion identity must match the retained guest that made the request. */
uint64_t mp_pool_generation(MpPool*,const uint8_t *id,size_t id_len);
int32_t mp_pool_svc_post(MpPool*,const uint8_t *id,size_t id_len,uint64_t generation,const uint8_t *line,size_t length);
int32_t mp_pool_background(MpPool*);
int32_t mp_pool_resume(MpPool*);
int32_t mp_pool_memory_warning(MpPool*);
const char *mp_pool_last_error(MpPool*);
int32_t mp_pool_destroy(MpPool*);
/* Strict Ed25519 host verification; key 32 bytes, signature 64, message <=64 KiB. */
int32_t mp_ed25519_verify(const uint8_t*,size_t,const uint8_t*,size_t,const uint8_t*,size_t);
#ifdef __cplusplus
}
#endif
#endif
