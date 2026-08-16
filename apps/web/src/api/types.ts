/** Credentials sent to `POST /auth/login`. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Credentials sent to `POST /auth/change-password`. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
