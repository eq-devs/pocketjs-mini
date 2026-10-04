#ifndef PJM_SVCWIRE_H
#define PJM_SVCWIRE_H
#include <stddef.h>
int svcwire_open(const char *name);
void svcwire_pump(void);
size_t svcwire_recv_lines(char *out, size_t capacity);
void svcwire_send_line(const char *line, size_t length);
void svcwire_shutdown(void);
size_t pjm_services_take(char *out, size_t capacity);
int pjm_services_reply(const char *line, size_t length);
#endif
