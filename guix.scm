; SPDX-License-Identifier: MPL-2.0
;; guix.scm — GNU Guix package definition for empty-linter
;; Usage: guix shell -f guix.scm

(use-modules (guix packages)
             (guix build-system gnu)
             (guix licenses))

(package
  (name "empty-linter")
  (version "0.1.0")
  (source #f)
  (build-system gnu-build-system)
  (synopsis "empty-linter")
  (description "empty-linter — part of the hyperpolymath ecosystem.")
  (home-page "https://github.com/hyperpolymath/empty-linter")
  (license ((@@ (guix licenses) license) "MPL-2.0"
             "https://github.com/hyperpolymath/palimpsest-license")))
