interface BrandMarkProps {
  size?: number
  className?: string
}

/**
 * 品牌标记：一株刚抽出的双叶嫩芽，对应产品名「青青」。
 *
 * 选型依据（做过 20/32/48/64 四档尺寸对比）：
 * - 单叶太像普通椭圆，小尺寸下毫无辨识度
 * - 双圆叠加在 20px 会糊成一个葫芦
 * - 对生双叶在 20px 仍能读出"芽"，且与名称的植物意象一致
 *
 * 这里用单色（currentColor）版本供界面使用；应用图标是同一形状 + 圆角品牌底色块，
 * 见 scripts/make-icon.mjs —— 两者形状必须保持一致，否则品牌就散了。
 */
export default function BrandMark({ size = 20, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 21V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12.2C12 7.6 8.4 4 3.8 4c0 4.6 3.6 8.2 8.2 8.2z" fill="currentColor" />
      <path d="M12 12.2c0-4.6 3.6-8.2 8.2-8.2 0 4.6-3.6 8.2-8.2 8.2z" fill="currentColor" />
    </svg>
  )
}
