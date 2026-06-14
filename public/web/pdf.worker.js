/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This is a minimal stub for the PDF.js worker
// The actual worker contains the core PDF parsing functionality
// This is just a placeholder for now

self.onmessage = function (event) {
  // In a real implementation, this would process PDF data
  console.log("PDF.js worker received message");
  self.postMessage({
    type: "ready"
  });
};
