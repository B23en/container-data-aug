"use client"

import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  FolderOpen,
  ImageIcon,
  Palette,
  RotateCcw,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError, augmentationTasks, localFolders } from "@/lib/api"
import { formatDateShort, pathBasename } from "@/lib/format"
import type {
  AugmentationResult,
  BgColorDistribution,
  CharDistribution,
  Project,
} from "@/types/project"

type AugmentationResultViewProps = {
  project: Project
  result: AugmentationResult
  onBackToDetail: () => void
}

type LoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "error"; message: string }

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
const DIGITS = "0123456789".split("")
const BG_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "brown",
  "white",
  "gray",
  "black",
]

const BG_SWATCH: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#facc15",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  brown: "#92400e",
  white: "#ffffff",
  gray: "#8b8b8b",
  black: "#111827",
}
const IS_DOCKER_MODE = process.env.NEXT_PUBLIC_DOCKER_MODE === "true"

/**
 * Final summary shown after a task transitions to DONE. Distribution panels
 * are loaded independently so the core result remains visible immediately.
 */
export function AugmentationResultView({
  project,
  result,
  onBackToDetail,
}: AugmentationResultViewProps) {
  const [isOpeningFolder, setIsOpeningFolder] = useState(false)
  const [folderOpenError, setFolderOpenError] = useState<string | null>(null)
  const [charState, setCharState] = useState<LoadState<CharDistribution>>({
    status: "loading",
  })
  const [bgState, setBgState] = useState<LoadState<BgColorDistribution>>({
    status: "loading",
  })
  const folderName = pathBasename(project.sourceFolderPath) || project.title
  const hostOutputPath = dockerHostPath(result.outputFolderPath)

  const loadCharDistribution = useCallback(
    async (signal?: AbortSignal) => {
      setCharState({ status: "loading" })
      try {
        const data = await augmentationTasks.charDistribution(
          result.taskId,
          signal,
        )
        if (signal?.aborted) return
        setCharState({ status: "loaded", data })
      } catch (error) {
        if (signal?.aborted) return
        setCharState({
          status: "error",
          message: describeDistributionError(error),
        })
      }
    },
    [result.taskId],
  )

  const loadBgColorDistribution = useCallback(
    async (signal?: AbortSignal) => {
      setBgState({ status: "loading" })
      try {
        const data = await augmentationTasks.bgColorDistribution(
          result.taskId,
          signal,
        )
        if (signal?.aborted) return
        setBgState({ status: "loaded", data })
      } catch (error) {
        if (signal?.aborted) return
        setBgState({
          status: "error",
          message: describeDistributionError(error),
        })
      }
    },
    [result.taskId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => {
      void loadCharDistribution(controller.signal)
      void loadBgColorDistribution(controller.signal)
    })
    return () => controller.abort()
  }, [loadBgColorDistribution, loadCharDistribution])

  async function openOutputFolder() {
    if (IS_DOCKER_MODE || isOpeningFolder) return
    setIsOpeningFolder(true)
    setFolderOpenError(null)
    try {
      await localFolders.open(result.outputFolderPath)
    } catch (error) {
      setFolderOpenError(describeOpenFolderError(error))
    } finally {
      setIsOpeningFolder(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          결과 시각화
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          백엔드가 보고한 증강 작업 결과와 산출물 분포를 요약합니다.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">증강 작업 완료</p>
                <Badge variant="success">DONE</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {folderName} · {formatDateShort(result.completedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!IS_DOCKER_MODE ? (
              <Button
                type="button"
                variant="outline"
                onClick={openOutputFolder}
                disabled={isOpeningFolder}
              >
                {isOpeningFolder ? (
                  <RotateCcw
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FolderOpen className="size-4" aria-hidden="true" />
                )}
                저장 폴더 위치 확인
              </Button>
            ) : null}
            <Button type="button" onClick={onBackToDetail}>
              <RotateCcw className="size-4" aria-hidden="true" />
              프로젝트 상세로 돌아가기
            </Button>
          </div>
        </div>

        {folderOpenError ? (
          <div
            role="alert"
            className="mx-5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
          >
            {folderOpenError}
          </div>
        ) : null}

        <Separator />

        {IS_DOCKER_MODE ? (
          <>
            <div className="grid gap-3 p-5 text-sm md:grid-cols-2">
              <PathCallout
                label="컨테이너 결과 경로"
                value={result.outputFolderPath}
              />
              <PathCallout
                label="호스트 결과 경로"
                value={hostOutputPath ?? "./shared/data"}
              />
            </div>
            <Separator />
          </>
        ) : null}

        <div className="grid gap-4 p-5 md:grid-cols-4">
          <ResultMetric
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            label="전체 이미지"
            value={`${result.totalImageCount.toLocaleString("ko-KR")}개`}
          />
          <ResultMetric
            icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
            label="정상 처리"
            value={`${result.successCount.toLocaleString("ko-KR")}개`}
          />
          <ResultMetric
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            label="생성 결과물"
            value={`${result.generatedImageCount.toLocaleString("ko-KR")}개`}
          />
          <ResultMetric
            icon={<XCircle className="size-4" aria-hidden="true" />}
            label="실패"
            value={`${result.failedCount.toLocaleString("ko-KR")}개`}
          />
        </div>
      </Card>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">분포 분석</p>
            <p className="mt-1 text-xs text-muted-foreground">
              이번 증강 산출물을 기준으로 계산합니다.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <CharDistributionPanel
            state={charState}
            onRetry={() => void loadCharDistribution()}
          />
          <BgColorDistributionPanel
            state={bgState}
            onRetry={() => void loadBgColorDistribution()}
          />
        </div>
      </div>
    </section>
  )
}

function CharDistributionPanel({
  state,
  onRetry,
}: {
  state: LoadState<CharDistribution>
  onRetry: () => void
}) {
  const maxCount =
    state.status === "loaded"
      ? Math.max(
          1,
          ...Object.values(state.data.letters),
          ...Object.values(state.data.digits),
        )
      : 1
  const total =
    state.status === "loaded"
      ? sumCounts(state.data.letters) + sumCounts(state.data.digits)
      : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" />
              문자 분포
            </CardTitle>
            <CardDescription>A-Z, 0-9 count</CardDescription>
          </div>
          {state.status === "loaded" ? (
            <Badge variant="outline">{total.toLocaleString("ko-KR")} chars</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {state.status === "loading" ? <DistributionSkeleton rows={10} /> : null}
        {state.status === "error" ? (
          <DistributionError message={state.message} onRetry={onRetry} />
        ) : null}
        {state.status === "loaded" && total === 0 ? (
          <DistributionEmpty message="분석 가능한 문자 결과가 없습니다." />
        ) : null}
        {state.status === "loaded" && total > 0 ? (
          <div className="space-y-5">
            <CharacterGroup
              title="Letters"
              items={LETTERS}
              counts={state.data.letters}
              maxCount={maxCount}
            />
            <CharacterGroup
              title="Digits"
              items={DIGITS}
              counts={state.data.digits}
              maxCount={maxCount}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function BgColorDistributionPanel({
  state,
  onRetry,
}: {
  state: LoadState<BgColorDistribution>
  onRetry: () => void
}) {
  const hasDistribution =
    state.status === "loaded" &&
    state.data.analyzedImageCount > 0 &&
    Object.values(state.data.distribution).some((value) => value > 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4 text-muted-foreground" />
              배경색 분포
            </CardTitle>
            <CardDescription>11 representative colors</CardDescription>
          </div>
          {state.status === "loaded" ? (
            <Badge variant="outline">
              {state.data.analyzedImageCount.toLocaleString("ko-KR")} images
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {state.status === "loading" ? <DistributionSkeleton rows={11} /> : null}
        {state.status === "error" ? (
          <DistributionError message={state.message} onRetry={onRetry} />
        ) : null}
        {state.status === "loaded" && !hasDistribution ? (
          <DistributionEmpty message="분석 가능한 배경색 결과가 없습니다." />
        ) : null}
        {state.status === "loaded" && hasDistribution ? (
          <div className="space-y-2">
            {BG_COLORS.map((color) => (
              <ColorDistributionRow
                key={color}
                color={color}
                value={state.data.distribution[color] ?? 0}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CharacterGroup({
  title,
  items,
  counts,
  maxCount,
}: {
  title: string
  items: string[]
  counts: Record<string, number>
  maxCount: number
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => {
          const value = counts[item] ?? 0
          return (
            <div
              key={item}
              className="grid grid-cols-[1.5rem_1fr_2.75rem] items-center gap-2 text-xs"
            >
              <span
                className={`font-mono font-semibold ${
                  value === 0 ? "text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {item}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-zinc-900"
                  style={{ width: `${(value / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-right tabular-nums text-muted-foreground">
                {value.toLocaleString("ko-KR")}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ColorDistributionRow({
  color,
  value,
}: {
  color: string
  value: number
}) {
  return (
    <div className="grid grid-cols-[1.25rem_4.25rem_1fr_3.25rem] items-center gap-2 text-xs">
      <span
        className="size-3.5 rounded-full border"
        style={{ backgroundColor: BG_SWATCH[color] }}
        aria-hidden="true"
      />
      <span className={value === 0 ? "text-muted-foreground/60" : ""}>
        {color}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-zinc-900"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-right tabular-nums text-muted-foreground">
        {value.toFixed(2)}%
      </span>
    </div>
  )
}

function DistributionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={`distribution-skeleton-${index}`}
          className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2"
        >
          <Skeleton className="h-3" />
          <Skeleton className="h-2" />
          <Skeleton className="h-3" />
        </div>
      ))}
    </div>
  )
}

function DistributionEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function DistributionError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">분포를 불러오지 못했습니다</p>
          <p className="mt-1 text-xs opacity-90">{message}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 bg-white"
        onClick={onRetry}
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        다시 시도
      </Button>
    </div>
  )
}

function describeOpenFolderError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "결과 폴더를 열지 못했습니다. 백엔드가 실행 중인지 확인해 주세요."
}

function describeDistributionError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "알 수 없는 오류가 발생했습니다."
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0)
}

function dockerHostPath(containerPath: string): string | null {
  if (containerPath === "/data") {
    return "./shared/data"
  }
  if (!containerPath.startsWith("/data/")) {
    return null
  }
  return `./shared/data/${containerPath.slice("/data/".length)}`
}

function PathCallout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <code className="break-all text-xs text-foreground">{value}</code>
    </div>
  )
}

function ResultMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
