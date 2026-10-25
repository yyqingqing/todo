interface BrandMarkProps {
  size?: number
  className?: string
}

/**
 * 品牌标记：楼梯剖面，对应产品名「拾阶」。
 *
 * 用实心形状而不是描边折线：在 18–20px 下，折线的台阶细节会被抗锯齿糊成一条斜线，
 * 实心轮廓在同样尺寸下仍然可辨。台阶数刻意只保留 3 级。
 */
export default function BrandMark({ size = 20, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M1.5 16.5V12h4V8h4V4h7v12.5z" fill="currentColor" />
    </svg>
  )
}
