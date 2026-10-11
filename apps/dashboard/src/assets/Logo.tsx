/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 100 100" {...props}>
      <path
        d="M50,6 L88,28 L88,72 L50,94 L12,72 L12,28 Z M12,28 L50,50 L88,28 M50,50 L50,94"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
