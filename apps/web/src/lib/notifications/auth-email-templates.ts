/**
 * Auth Email Templates — Per-Vertical Branded Templates for Supabase Auth Hook
 *
 * These templates replace Supabase's built-in auth emails with branded versions
 * sent through Resend. Each template returns subject + HTML + plain text.
 *
 * i18n: All user-visible strings use t() for locale-aware translation.
 */

import { t } from '@/lib/locale/messages'

interface AuthEmailTemplateInput {
  brandName: string
  brandColor: string
  brandDomain: string
  verificationUrl: string
  vertical?: string
  locale?: string
}

interface AuthEmailTemplate {
  subject: string
  htmlBody: string
  textBody: string
}

type EmailActionType = 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'invite'

export function getAuthEmailTemplate(
  actionType: EmailActionType,
  input: AuthEmailTemplateInput
): AuthEmailTemplate {
  switch (actionType) {
    case 'signup':
      return signupTemplate(input)
    case 'recovery':
      return recoveryTemplate(input)
    case 'magiclink':
      return magiclinkTemplate(input)
    case 'email_change':
      return emailChangeTemplate(input)
    case 'invite':
      return inviteTemplate(input)
    default:
      return signupTemplate(input)
  }
}

function signupTemplate({ brandName, verificationUrl, locale }: AuthEmailTemplateInput): AuthEmailTemplate {
  const vars = { brandName }
  return {
    subject: t('auth_email.signup_subject', locale, vars),
    htmlBody: `
      <p style="margin:0 0 12px">${t('auth_email.signup_welcome', locale, vars)}</p>
      <p style="margin:0 0 12px">${t('auth_email.signup_cta', locale)}</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${t('auth_email.signup_btn', locale)}</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.btn_fallback', locale)}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.signup_ignore', locale)}</p>
    `,
    textBody: `${t('auth_email.signup_welcome', locale, vars)}\n\n${t('auth_email.signup_cta', locale)}\n${verificationUrl}\n\n${t('auth_email.signup_ignore', locale)}`,
  }
}

function recoveryTemplate({ brandName, verificationUrl, locale }: AuthEmailTemplateInput): AuthEmailTemplate {
  const vars = { brandName }
  return {
    subject: t('auth_email.recovery_subject', locale, vars),
    htmlBody: `
      <p style="margin:0 0 12px">${t('auth_email.recovery_intro', locale, vars)}</p>
      <p style="margin:0 0 12px">${t('auth_email.recovery_cta', locale)}</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${t('auth_email.recovery_btn', locale)}</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.btn_fallback', locale)}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.recovery_ignore', locale)}</p>
    `,
    textBody: `${t('auth_email.recovery_intro', locale, vars)}\n\n${t('auth_email.recovery_cta', locale)}\n${verificationUrl}\n\n${t('auth_email.recovery_ignore', locale)}`,
  }
}

function magiclinkTemplate({ brandName, verificationUrl, locale }: AuthEmailTemplateInput): AuthEmailTemplate {
  const vars = { brandName }
  return {
    subject: t('auth_email.magiclink_subject', locale, vars),
    htmlBody: `
      <p style="margin:0 0 12px">${t('auth_email.magiclink_cta', locale, vars)}</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${t('auth_email.magiclink_btn', locale)}</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.btn_fallback', locale)}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.magiclink_expire', locale)}</p>
    `,
    textBody: `${t('auth_email.magiclink_cta', locale, vars)}\n${verificationUrl}\n\n${t('auth_email.magiclink_expire', locale)}`,
  }
}

function emailChangeTemplate({ brandName, verificationUrl, locale }: AuthEmailTemplateInput): AuthEmailTemplate {
  const vars = { brandName }
  return {
    subject: t('auth_email.email_change_subject', locale, vars),
    htmlBody: `
      <p style="margin:0 0 12px">${t('auth_email.email_change_intro', locale, vars)}</p>
      <p style="margin:0 0 12px">${t('auth_email.email_change_cta', locale)}</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${t('auth_email.email_change_btn', locale)}</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.btn_fallback', locale)}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.email_change_warn', locale)}</p>
    `,
    textBody: `${t('auth_email.email_change_intro', locale, vars)}\n\n${t('auth_email.email_change_cta', locale)}\n${verificationUrl}\n\n${t('auth_email.email_change_warn', locale)}`,
  }
}

function inviteTemplate({ brandName, verificationUrl, locale }: AuthEmailTemplateInput): AuthEmailTemplate {
  const vars = { brandName }
  return {
    subject: t('auth_email.invite_subject', locale, vars),
    htmlBody: `
      <p style="margin:0 0 12px">${t('auth_email.invite_welcome', locale, vars)}</p>
      <p style="margin:0 0 12px">${t('auth_email.invite_cta', locale)}</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${t('auth_email.invite_btn', locale)}</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px">${t('auth_email.btn_fallback', locale)}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;word-break:break-all">${verificationUrl}</p>
    `,
    textBody: `${t('auth_email.invite_welcome', locale, vars)}\n\n${t('auth_email.invite_cta', locale)}\n${verificationUrl}`,
  }
}
