// strip-for-rigging.mjs
// Creates a lightweight rigging-only GLB by:
// 1. Simplifying materials to flat colors
// 2. Decimating mesh geometry (reduce vertex count)
// 3. Removing unused data

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const INPUT = './OriginalMuscular002.glb';
const OUTPUT = './RiggingModel.glb';
const TARGET_RATIO = 0.15; // keep 15% of triangles

async function main() {
    await MeshoptSimplifier.ready;

    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

    console.log('Loading model...');
    const doc = await io.read(INPUT);
    const root = doc.getRoot();

    // 1. Simplify materials (flat colors per tissue type)
    const materials = root.listMaterials();
    console.log(`Simplifying ${materials.length} materials...`);

    const tissueColors = {
        'Muscles':            [0.90, 0.15, 0.10, 1],  // 진한 빨강
        'Bone':               [0.95, 0.85, 0.55, 1],  // 밝은 황금색
        'Tendon':             [0.45, 0.25, 0.75, 1],  // 진한 보라
        'Ligament':           [0.10, 0.75, 0.55, 1],  // 선명한 청록
        'Cartilage':          [0.20, 0.70, 0.90, 1],  // 밝은 파랑
        'Articular_capsule':  [0.70, 0.30, 0.90, 1],  // 선명한 자주
    };

    for (const mat of materials) {
        const name = mat.getName();
        let color = [0.7, 0.7, 0.7, 1];
        for (const [key, c] of Object.entries(tissueColors)) {
            if (name.startsWith(key)) { color = c; break; }
        }
        mat.setBaseColorFactor(color);
        mat.setBaseColorTexture(null);
        mat.setNormalTexture(null);
        mat.setOcclusionTexture(null);
        mat.setEmissiveTexture(null);
        mat.setMetallicRoughnessTexture(null);
        mat.setMetallicFactor(0.0);
        mat.setRoughnessFactor(0.9);
        mat.setEmissiveFactor([0, 0, 0]);
    }

    // Remove textures
    for (const tex of root.listTextures()) tex.dispose();

    // 2. Log mesh info before
    const meshesBefore = root.listMeshes();
    let totalTrisBefore = 0;
    for (const mesh of meshesBefore) {
        for (const prim of mesh.listPrimitives()) {
            const idx = prim.getIndices();
            if (idx) totalTrisBefore += idx.getCount() / 3;
        }
    }
    console.log(`Before: ${meshesBefore.length} meshes, ${Math.round(totalTrisBefore).toLocaleString()} triangles`);

    // 3. Weld vertices then simplify
    console.log('Welding vertices...');
    await doc.transform(weld({ tolerance: 0.0001 }));

    console.log(`Simplifying to ${(TARGET_RATIO * 100)}% of triangles...`);
    await doc.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_RATIO, error: 0.01 })
    );

    // 4. Prune & dedup
    console.log('Pruning unused resources...');
    await doc.transform(dedup(), prune());

    // 5. Log mesh info after
    const meshesAfter = root.listMeshes();
    let totalTrisAfter = 0;
    for (const mesh of meshesAfter) {
        for (const prim of mesh.listPrimitives()) {
            const idx = prim.getIndices();
            if (idx) totalTrisAfter += idx.getCount() / 3;
        }
    }
    console.log(`After: ${meshesAfter.length} meshes, ${Math.round(totalTrisAfter).toLocaleString()} triangles`);

    // 6. Write
    console.log('Writing rigging model...');
    await io.write(OUTPUT, doc);

    const fs = await import('fs');
    const origSize = fs.statSync(INPUT).size;
    const newSize = fs.statSync(OUTPUT).size;
    console.log(`\nOriginal: ${(origSize / (1024 * 1024)).toFixed(1)} MB`);
    console.log(`Rigging:  ${(newSize / (1024 * 1024)).toFixed(1)} MB`);
    console.log(`Reduction: ${((1 - newSize / origSize) * 100).toFixed(0)}%`);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
