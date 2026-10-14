import {
  MissingRequiredClientCapabilityError,
  UnsupportedProtocolVersionError,
} from '@modelcontextprotocol/server';

/**
 * Messages of the plain `Error`s the SDK's handler reports when it rejects a
 * malformed request with a 4xx (headers that disagree with the body, a missing
 * `_meta` envelope, a 2025-era request on the modern path, a non-JSON body).
 */
const REJECTION_MESSAGE =
  /^(Rejected inbound request \(|Rejected 2025-era request on a modern-only endpoint|Unsupported Media Type:)/;

/**
 * Whether an error the SDK's handler reported (`onerror`) is a request it
 * rejected with a 4xx, not a failure in this server. The client already gets
 * the error in the response, so logging it adds nothing, and anyone can send
 * malformed requests.
 *
 * Anything unrecognized counts as a server failure. If the SDK renames a
 * rejection, it gets logged again; a real failure is never hidden.
 */
export function isClientRejection(error: unknown): boolean {
  if (
    error instanceof UnsupportedProtocolVersionError ||
    error instanceof MissingRequiredClientCapabilityError
  )
    return true;
  return error instanceof Error && REJECTION_MESSAGE.test(error.message);
}
