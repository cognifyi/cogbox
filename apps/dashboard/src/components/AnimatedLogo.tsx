/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { motion, MotionProps } from 'motion/react'
import { ComponentProps } from 'react'

const wordmarkProps: MotionProps = {
  initial: {
    filter: 'blur(2px)',
    x: -4,
    opacity: 0,
  },
  animate: {
    filter: 'blur(0px)',
    x: 0,
    opacity: 1,
  },
  transition: {
    duration: 0.15,
    ease: 'easeInOut',
    delay: 0.1,
  },
}

const logoMarkProps: MotionProps = {
  initial: {
    opacity: 0,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    scale: 1,
  },
  transition: {
    duration: 0.25,
    ease: 'easeOut',
  },
}

type AnimatedLogoProps = ComponentProps<typeof motion.svg> & {
  animated?: boolean
}

const animationProps = (animated: boolean, props: MotionProps): MotionProps => (animated ? props : {})

export function AnimatedLogo({ animated = true, ...props }: AnimatedLogoProps) {
  return (
    <motion.svg width="132" height="26" viewBox="0 0 132 26" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <motion.g {...animationProps(animated, logoMarkProps)}>
        <g transform="translate(0, 0) scale(0.26)">
          <path
            d="M50,6 L88,28 L88,72 L50,94 L12,72 L12,28 Z M12,28 L50,50 L88,28 M50,50 L50,94"
            fill="none"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      </motion.g>
      <motion.text
        {...animationProps(animated, wordmarkProps)}
        x="33"
        y="20"
        fill="currentColor"
        fontFamily="Lato, 'DejaVu Sans', system-ui, sans-serif"
        fontWeight="900"
        fontSize="20"
        letterSpacing="0.5"
      >
        cogbox
      </motion.text>
    </motion.svg>
  )
}
