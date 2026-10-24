import {
  ComputerIcon,
  LaptopIcon,
  SmartPhone01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import type { DeviceKind } from "@/lib/device"

const ICON: Record<DeviceKind, typeof ComputerIcon> = {
  iphone: SmartPhone01Icon,
  android: SmartPhone01Icon,
  ipad: Tablet01Icon,
  mac: LaptopIcon,
  windows: LaptopIcon,
  linux: LaptopIcon,
  chromeos: LaptopIcon,
  other: ComputerIcon,
}

export function DeviceIcon({
  device,
  className,
}: {
  device: DeviceKind | null | undefined
  className?: string
}) {
  return <Icon icon={ICON[device ?? "other"]} className={className} />
}
