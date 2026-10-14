// Client-safe password rule shared by the sign-up/reset forms and server validators.
// Minimum set to 6 at the owner's request; Supabase Auth's
// own "Minimum password length" setting must not be set higher than this.
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;
