/** Host/tooling release metadata; guest versions and host ABI are independent. */
export const RELEASE_VERSION = "0.0.1";
// Preserve upgrade ordering over the development host's previously emitted code 4.
export const RELEASE_BUILD = 5;
if (import.meta.main) console.log(`pjm ${RELEASE_VERSION} (build ${RELEASE_BUILD})`);
