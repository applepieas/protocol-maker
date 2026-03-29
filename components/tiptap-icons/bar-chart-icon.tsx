import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const BarChartIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 3C3.55228 3 4 3.44772 4 4V18H20C20.5523 18 21 18.4477 21 19C21 19.5523 20.5523 20 20 20H3C2.44772 20 2 19.5523 2 19V4C2 3.44772 2.44772 3 3 3ZM8 10C8.55228 10 9 10.4477 9 11V17C9 17.5523 8.55228 18 8 18C7.44772 18 7 17.5523 7 17V11C7 10.4477 7.44772 10 8 10ZM13 7C13.5523 7 14 7.44772 14 8V17C14 17.5523 13.5523 18 13 18C12.4477 18 12 17.5523 12 17V8C12 7.44772 12.4477 7 13 7ZM18 13C18.5523 13 19 13.4477 19 14V17C19 17.5523 18.5523 18 18 18C17.4477 18 17 17.5523 17 17V14C17 13.4477 17.4477 13 18 13Z"
        fill="currentColor"
      />
    </svg>
  )
})

BarChartIcon.displayName = "BarChartIcon"
