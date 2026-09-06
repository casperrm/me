import sharp from "sharp";
import { prisma } from "@cedar/db";
import { storageAdapter } from "../storage";

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type CheckStatus = "pass" | "warning" | "fail" | "skipped";
export interface QualityCheck {
  name: string;
  status: CheckStatus;
  message: string;
}
export type OverallStatus = "pass" | "warning" | "fail";

// Section 9/15's platform strings mapped to the aspect ratios that
// platform actually accepts, for the "dimensions/specifications" check
// (Section 5). Not exhaustive — an unrecognized platform simply skips
// this check rather than guessing.
const PLATFORM_ASPECT_SPECS: Record<string, { label: string; ratio: number }[]> = {
  instagram_feed: [
    { label: "1:1", ratio: 1 },
    { label: "4:5", ratio: 4 / 5 },
  ],
  instagram_story: [{ label: "9:16", ratio: 9 / 16 }],
  instagram_reel: [{ label: "9:16", ratio: 9 / 16 }],
  tiktok: [{ label: "9:16", ratio: 9 / 16 }],
  meta: [
    { label: "1:1", ratio: 1 },
    { label: "1.91:1", ratio: 1.91 },
  ],
  youtube: [{ label: "16:9", ratio: 16 / 9 }],
  linkedin: [
    { label: "1:1", ratio: 1 },
    { label: "1.91:1", ratio: 1.91 },
  ],
};
const ASPECT_TOLERANCE = 0.05;

/**
 * Quality Control (Bible Section 5: "Quality Control checks outputs for
 * brand consistency, spelling/language, required information, dimensions/
 * specifications, and obvious inconsistencies before client review";
 * Section 6.1/7 call this "Quality Control AI" in the orchestrated flow).
 *
 * Scope boundary, stated explicitly: these are deterministic rule checks
 * against Brand DNA's prohibited-language/required-disclaimer lists and a
 * static platform aspect-ratio table — not an LLM judgment call. No AI
 * Foundation wiring exists yet to do a genuine "does this feel on-brand"
 * assessment (that's Phase 3+ once Cedar Brain is more than the routing
 * stub in ADR-007). Advisory, never blocking: a FAIL is surfaced
 * prominently but does not prevent requestApproval from proceeding —
 * Section 5 says checks happen "before client review," which is a
 * visibility requirement, not a hard gate a human can't override.
 */
export async function runQualityChecks(creativeVersionId: string): Promise<{
  overallStatus: OverallStatus;
  checks: QualityCheck[];
}> {
  const version = await prisma.creativeVersion.findUniqueOrThrow({
    where: { id: creativeVersionId },
    include: {
      asset: true,
      creative: {
        include: {
          campaign: { include: { project: { include: { client: { include: { brandProfile: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } } } } } },
          videoBrief: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
        },
      },
    },
  });

  const brand = version.creative.campaign.project.client.brandProfile?.versions[0];
  const prohibitedLanguage = parseJSON<string[]>(brand?.prohibitedLanguage, []);
  const requiredDisclaimers = parseJSON<string[]>(brand?.requiredDisclaimers, []);

  const videoVersion = version.creative.videoBrief?.versions[0];
  const combinedText = [
    version.notes,
    videoVersion?.concept,
    videoVersion?.hook,
    videoVersion?.script,
    videoVersion?.captionCopy,
    videoVersion?.voiceoverCopy,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const checks: QualityCheck[] = [];

  // Brand consistency / language: prohibited terms.
  const foundProhibited = prohibitedLanguage.filter((term) => combinedText.includes(term.toLowerCase()));
  checks.push(
    foundProhibited.length > 0
      ? { name: "prohibited_language", status: "fail", message: `Contains prohibited language: ${foundProhibited.join(", ")}` }
      : { name: "prohibited_language", status: "pass", message: "No prohibited language found." },
  );

  // Required information: disclaimers.
  const missingDisclaimers = requiredDisclaimers.filter((d) => !combinedText.includes(d.toLowerCase()));
  checks.push(
    requiredDisclaimers.length === 0
      ? { name: "required_disclaimers", status: "skipped", message: "No required disclaimers configured for this client." }
      : missingDisclaimers.length > 0
        ? { name: "required_disclaimers", status: "warning", message: `Missing required disclaimer(s): ${missingDisclaimers.join(", ")}` }
        : { name: "required_disclaimers", status: "pass", message: "All required disclaimers present." },
  );

  // Dimensions/specifications: image aspect ratio vs. platform spec.
  const specs = version.creative.platform ? PLATFORM_ASPECT_SPECS[version.creative.platform] : undefined;
  if (!version.asset || !specs) {
    checks.push({ name: "dimensions_spec", status: "skipped", message: "No linked image asset or no known spec for this platform." });
  } else if (!version.asset.contentType?.startsWith("image/")) {
    checks.push({ name: "dimensions_spec", status: "skipped", message: "Dimension checks currently only support image assets." });
  } else {
    try {
      const data = await storageAdapter.read(version.asset.storageKey);
      const metadata = await sharp(data).metadata();
      if (!metadata.width || !metadata.height) {
        checks.push({ name: "dimensions_spec", status: "skipped", message: "Could not read image dimensions." });
      } else {
        const actualRatio = metadata.width / metadata.height;
        const matches = specs.some((s) => Math.abs(actualRatio - s.ratio) / s.ratio <= ASPECT_TOLERANCE);
        checks.push(
          matches
            ? { name: "dimensions_spec", status: "pass", message: `${metadata.width}x${metadata.height} matches an accepted aspect ratio for ${version.creative.platform}.` }
            : {
                name: "dimensions_spec",
                status: "warning",
                message: `${metadata.width}x${metadata.height} doesn't match any accepted ratio for ${version.creative.platform} (expected ${specs.map((s) => s.label).join(" or ")}).`,
              },
        );
      }
    } catch {
      checks.push({ name: "dimensions_spec", status: "skipped", message: "Could not read the asset file to check dimensions." });
    }
  }

  const overallStatus: OverallStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warning")
      ? "warning"
      : "pass";

  await prisma.qualityCheckResult.create({
    data: { creativeVersionId, overallStatus, checks: JSON.stringify(checks) },
  });

  return { overallStatus, checks };
}
